# Authorization Design — Tenancy & Roles (Day 4)

**Status: implemented, with live-stack verification in `docs/testing.md`.** Account Service is the
source of truth for membership changes. Gateway and Todo Service consume its transactional
`workspace.membership-changed` events into local Redis projections. Request-path authorization
uses those local projections and never synchronously calls Account Service (TN-6). Role changes are
applied against every request, and removal records a revoked-before watermark checked against the
validated original JWT `iat`, including after a later re-add (TN-7). Redis failure fails closed with
`503`; missing membership is denied by default. See `docs/workspace-membership-projection.md` for
operations, backfill controls, and exact verification commands.

## 1. The problem this document exists to resolve

- **TN-6**: a service must decide an authorization question using data it already holds. It must
  not make a synchronous call to another service to answer it.
- **TN-7**: removing a person from a workspace, or reducing their role, must take effect
  immediately — including for a token issued before the change, and including for a request
  already in flight when the change commits.

Read together, these forbid both of the obvious answers: you cannot put roles in the JWT (fails
TN-7, a stale token keeps the old role until it expires), and you cannot call the owning service
per request to check the current role (fails TN-6, and is exactly the defect M1 fixed for
sessions).

## 2. Precedent already shipped: session revocation (M1)

Account Service owns session state. Gateway used to call `GET /internal/v1/accounts/me` on every
authenticated request to check whether the caller's session was still valid — a synchronous call
per request, and the thing TN-6 forbids in general.

The fix, already implemented and tested:

1. Account Service publishes `account.session-revoked` (`{ userId, sessionId | null, revokedAt }`)
   transactionally, in the same commit as the session-revocation write, whenever a session is
   revoked (logout, refresh-token reuse, email change, password reset).
Source: `apps/account-service/src/modules/workspace/workspace-membership-event.ts`,
`apps/gateway/src/security/workspace-membership.consumer.ts`,
`apps/todo-service/src/events/workspace-membership.consumer.ts`, and
`apps/gateway/src/__tests__/todo.e2e.test.ts`.

- **TN-6**: middleware reads one local Redis snapshot. Account Service HTTP calls used to execute
  authentication, profile, or workspace-management operations remain valid business operations;
  they are not per-request remote authorization checks. Protected workspace endpoints authorize
  locally before proxying any permitted operation.
- **TN-7, role change**: every event atomically updates the role projection. `canPerform` evaluates
  the current projected role regardless of how long ago the bearer token was issued.
- **TN-7, removal**: one atomic Redis script deletes the role and stores the event timestamp as the
  revoked-before watermark. Gateway passes the validated original JWT `iat` in the signed internal
  identity envelope to Todo Service. Both services deny when `iat <= revokedBefore`. Re-adding a
  user preserves the watermark, so an old unexpired token stays revoked; a newly issued token after
  re-add may be authorized.
- **Delivery and failures**: consumers acknowledge only after the atomic projection write resolves;
  failed writes are nacked for redelivery. Older out-of-order events are ignored using their
  `changedAt` version. Redis outages return `503`, not an authorization bypass.
- **Propagation latency**: measured by the Docker Compose e2e test and printed per role change and
  removal. Treat it as an observation, not an SLA, until repeated runs establish an operational
  target.

## 4. Where the permission table lives (TN-3, TN-4, TN-5)

- The role → permitted-operation mapping is defined **once**, in `@todo/contracts`, as a plain
  data structure (not scattered `if (role === ...)` checks). Every service imports the same
  `canPerform(role, action)` function from that one definition.
- Adding a role, or changing what an existing role may do, means editing that one file. No
  endpoint's code changes, and no other role's test expectations change, because every check goes
  through the same function instead of each endpoint re-deriving the answer.
- This satisfies TN-5 directly: the table is the single place, and it is enforced from that single
  place everywhere, which is also what `AUT-2` will point to.

### Permission table (AUT-1)

The executable source of this table is
`packages/contracts/src/authorization/workspace-authorization.ts`. `canPerform(role, action)` is
the only policy decision function services may call. A row describes an operation; **yes** means
permitted and **no** means refused.

| Operation | Administrator | Editor | Viewer |
|---|---:|---:|---:|
| Read workspace | yes | yes | yes |
| Update workspace | yes | no | no |
| Delete workspace | yes | no | no |
| List members | yes | yes | yes |
| Add member | yes | no | no |
| Change member role | yes | no | no |
| Remove member | yes | no | no |
| Create task | yes | yes | no |
| Read task | yes | yes | yes |
| Update task | yes | yes | no |
| Delete task | yes | yes | no |

Role checks alone will not implement the invariants that depend on current state. The membership
write path must additionally prevent self-promotion and self-addition (TN-8) and must lock the
workspace membership rows while checking that an administrator removal or demotion would not
remove the last administrator (TN-9).

## 5. Operational status and remaining independent gaps

Listed explicitly so nothing here is claimed as done before it is:

- The database schema for `workspaces` and `workspace_members` (done — see
  `009_create_workspaces_and_memberships.cjs`).
- The workspace HTTP API surface (done — `docs/api.md` §5a; live-verified through the Gateway,
  not just unit-tested).
- Local membership projections outside Account Service: implemented by Gateway and Todo Service;
  contract and operational procedure are in `docs/workspace-membership-projection.md`.
- The backfill migration moving existing tasks into an unambiguous workspace when exactly one
  workspace exists (TN-11) — applied and repeated against the live Compose database; ambiguous
  owners remain ownerless and are reported for review.
- Repeated production-representative propagation measurements needed to set an ARC-8 latency SLA.

The TN-9 proof creates two temporary administrators in PostgreSQL and issues reciprocal removals
concurrently through the real repository. PostgreSQL workspace-row locking permits one removal,
rejects the other, and leaves one administrator. The fixture and outbox rows are cleaned up after
the check.

## 7. Manual verification of this document (empirical proof)

The following steps were executed against the live `docker-compose` stack and verified. The
tests below include both manual steps and automated unit/integration checks. Automated test
commands are listed in `docs/testing.md`.

The policy and AUT-1 table have one executable proof command:

```bash
npm run verify:authorization
```

This builds and tests `@todo/contracts`, then reads this Markdown table independently and compares
all 33 decisions with the package's built public exports. Exact clean-clone steps, expected output,
and a deliberate-failure check are recorded in `docs/testing.md`. This command proves the policy
definition and its documentation agree; it does **not** replace the consumer, middleware, or live
Docker Compose evidence listed in `docs/testing.md`.

1. Confirm no part of this design proposes putting `role` inside the access token — grep the
   codebase's JWT signing code (`apps/account-service/src/security/access-token.service.ts`) and
   confirm it still only signs `sub`, `sid`, `email`, `iat`. If a role ever appears there, this
   design has been violated.
2. Confirm the precedent it's based on is real, not aspirational: re-run
   `apps/gateway/src/middleware/__tests__/authenticate.middleware.test.ts` and re-read
   `apps/gateway/src/security/session-revocation.cache.ts` — the pattern being extended to roles
   must already work for sessions before it's trusted for roles.
3. Run the focused TN-6/TN-7 command block in `docs/testing.md`, then run the Docker Compose
  scenario that proves role downgrade and removal against an already-issued token. The scenario
  records measured event-propagation latency and proves a re-added member needs a newly issued
  token.

## 7. Manual verification performed for the workspace HTTP API (this commit)

Run against the live `docker-compose` stack (`docker compose up -d --build account-service gateway`),
using two freshly registered accounts:

1. `POST /api/v1/workspaces` as user A → `201`, user A is returned as the workspace in
   `GET /api/v1/workspaces/:id`.
2. `POST /api/v1/workspaces/:id/members` with `userId` set to A's own id →
   `403 WORKSPACE_SELF_CHANGE_FORBIDDEN` (TN-8, confirmed live, not just unit-tested).
3. `POST /api/v1/workspaces/:id/members` adding user B as `editor` → `204`; `PATCH .../members/:userIdB`
   promoting B to `administrator` → `204`; `DELETE .../members/:userIdB` → `204` (back to one
   administrator).
4. After removal, `GET /api/v1/workspaces/:id` as user B → `404 WORKSPACE_NOT_FOUND` — identical
   to a workspace that never existed, confirming TN-12 live (not inferable whether B was ever a
   member or whether the workspace exists).
5. Re-added B as `viewer`; B attempting `POST /api/v1/workspaces/:id/members` →
   `403 WORKSPACE_ACTION_FORBIDDEN` (role enforcement confirmed live for a non-administrator).
6. The live PostgreSQL TN-9 concurrency proof is documented in `docs/testing.md` and can be
  repeated with the Compose command above.

