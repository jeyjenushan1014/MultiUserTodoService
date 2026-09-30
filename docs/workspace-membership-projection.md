-# Workspace membership projection (Redis)

Gateway and Todo Service maintain local Redis projections so request-path authorization never
calls Account Service (TN-6). Membership-change events update each projection and carry the
original user's JWT `iat` through Gateway's signed internal identity to Todo Service (TN-7).

Key names and shapes

- Membership key (role):

	`workspace.membership:<userId>:<workspaceId>` -> string role (`administrator` | `editor` | `viewer`)

- Revoked-before key (timestamp):

	`workspace.revoked:<userId>:<workspaceId>` -> numeric epoch seconds (UTC) representing `revoked-before`

TTL and configuration

- TTL environment variable: `WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS` (default 3600). Keep this at
	least as long as the maximum access-token lifetime so a removed member's old token cannot become
	valid again when the revoked-before key expires.
- `WORKSPACE_PROJECTION_FAIL_OPEN` accepts the literal `true` or `false` and defaults to `false`.
	It is an emergency, temporary backfill escape hatch only. Enabling it permits an unknown
	membership when both projection keys are absent; it never overrides an existing revoked-before
	marker and never overrides a Redis outage. Turn it off after backfill and do not enable it in
	production steady state.

Examples (observability):

```
# membership key example (expires in 900s)
SET workspace.membership:29159e6a-3dc0-4415-ac22-d75aec4b3069:8a7f5e2a-... "editor" EX 900

# revoked-before key example (expires in 900s)
SET workspace.revoked:29159e6a-3dc0-4415-ac22-d75aec4b3069:8a7f5e2a-... 169... EX 900
```

Consumer semantics (what the projection consumer must do)

- On `workspace.membership-changed` event with `role` !== null:
	1. Atomically compare `changedAt` with the saved projection version; ignore older events.
	2. Atomically write the role and version. Preserve any prior revoked-before watermark so a
		 previously-issued token is not revived if the user is added again.
	3. Log `(userId, workspaceId)`, event `changedAt`, and projection lag.

- On `workspace.membership-changed` event with `role` === null (removal):
	1. Atomically compare `changedAt` with the saved projection version; ignore older events.
	2. Atomically delete the role and set `workspace.revoked` to `changedAt` in Unix seconds.
	3. Log `(userId, workspaceId)`, event `changedAt`, and projection lag.

- All Redis writes for an event run in one Lua script, so readers cannot observe a delete/set gap.
- Redis writes must succeed before the consumer `ACK`s the message. On Redis failure the consumer
	`NACK`s with requeue and does not acknowledge the event. Duplicate deliveries are safe.

Authorization check semantics (middleware)

- The `authorizeWorkspace` middleware (Gateway and Todo Service) must:
	1. Atomically read role and revoked-before for `(userId, workspaceId)` using Redis `MGET`.
	2. Require the validated original JWT `iat`; missing `iat` is an authentication-context error.
	3. If `revokedEpoch >= token.iat`, deny the request.
	4. Else if a role exists, enforce it with `canPerform(role, action)`.
	5. Else deny by default. The temporary fail-open flag may allow only the unknown/no-marker case.
	6. If Redis is unavailable or the projection is corrupt, return `503`; never treat infrastructure
		failure as missing membership or allow the request.

Notes on `iat` handling

- Access tokens include an `iat` claim in Unix seconds. Gateway validates it and passes that
	original value inside the HMAC-signed `x-internal-identity` envelope. Todo Service compares this
	value, not the newly-generated internal envelope timestamp, with `workspace.revoked`.

Observability and tracing

- Consumer logs include event type, event `changedAt`, userId, workspaceId, projection lag, and
	retry/error details. RabbitMQ redelivery after a failed Redis write is the delivery evidence;
	`workspace.revoked` and the authorization response provide revocation evidence.

Backfill and manual verification

- Backfill script `apps/todo-service/scripts/backfill-workspaces.mjs` is dry-run by default and
	writes ambiguous cases to CSV. Prefer seeding every projection before enabling protected routes.
	Only during a controlled backfill window may operators set
	`WORKSPACE_PROJECTION_FAIL_OPEN=true`; monitor missing-projection metrics/logs and disable it
	immediately when backfill and consumer catch-up complete.

From the repository root, run the full-stack TN-6/TN-7 proof:

```powershell
docker compose up -d --build
npm run test:e2e -w @todo/gateway -- --testNamePattern="revokes a prior token after workspace membership removal"
```

The test logs measured propagation latency for both role downgrade and membership removal. It
reuses the removed member's original token after re-add to prove it stays invalid, then logs in
again and proves a newly issued token works.

Security

- The internal projection consumer service must authenticate to the broker and restrict which
	queues it binds to. Redis access should be limited and monitored. Revoked timestamps are
	authoritative only when written by the consumer after successful persistence.

This documents the implemented TN-6/TN-7 projection contract. The live-stack latency result is
captured by the test run and must not be represented as a fixed SLA until repeated measurements
establish one.
