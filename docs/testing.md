# Testing and Verification

## Automated commands

```bash
npm run check
npm run test:e2e
npm run verify:authorization
npm run verify:account-erasure -- <deletion-request-id> <user-id> <email>
npm run verify:account-lifecycle
```

`npm run check` runs lint, TypeScript builds, and unit tests without requiring manually started infrastructure. `npm run test:e2e` exercises the public Gateway path against the Docker stack.

### PF-2 cursor pagination

See [pagination.md](pagination.md) for focused unit commands, the real
100,000-row PostgreSQL verifier (`npm run verify:pagination` with dedicated
`PF2_DATABASE_URL`), its fixed first/deep-page comparison threshold, and the live
Gateway/cache E2E command. Database timing is not mocked and is not a substitute
for full HTTP load objectives. Never point the scratch verifier at production.

### Day 4 verification isolation

`npm run verify:day4` creates a fresh local clone of the selected committed revision
(`HEAD` by default; override with `-- --ref <revision>`). The verifier's own source must
exist in that revision. Installation, lint, build, tests, and E2E run inside a Node.js 24
validation image, not against a reused host `node_modules` directory.

Every Compose subprocess uses the same unique project, explicit base/verification files,
and empty environment file. The resolved model is checked before startup: host port
publication, fixed container names, privileged containers, host networking, and shared
external networks/volumes are refused. The RPC is an isolated local Anvil chain populated
from the committed TaskHistory deployment bytecode fixture; it never connects to a public
testnet. The RPC's configured chain ID, address, mined deployment, confirmations, projection
rebuild, and progress checkpoint are verified rather than replaced by invented lag values.

Per-run database, Redis, RabbitMQ, JWT, and internal-service credentials are generated in
memory. Mail is sink-only with an empty secret directory. `.env`, provider credentials, and
developer RPC/Compose selectors are not inherited. Cleanup targets only this project and
its unique image aliases; no default Compose stack is reset. `-- --keep` is diagnostic
retention of the disposable resources, not permission to reuse them as production.

See [operator-verification.md](operator-verification.md) for the command proof inventory.
The dated result in [day-4-verification-baseline.md](day-4-verification-baseline.md)
distinguishes an actually tested revision/source snapshot from implementation-only claims.
Real mail, public-chain deployment, destructive restore, and incident-approved writes still
require their documented inputs and approvals; the safe verifier never performs them on
production.

### Real review-remediation checks

`npm run verify:day4 -- --working-tree` verifies an isolated source snapshot including
uncommitted fixes. It is not proof of a committed clean clone. The full flow now includes:

- real authenticated Gateway task edits using one observed `version`: exactly one winner
  and one `409 TODO_VERSION_CONFLICT`, with persisted state checked;
- RPC container stop/restart while HTTP task creation must continue;
- a real writer killed after actual RPC broadcast, before acknowledgement, followed by
  durable-hash reconciliation by restarted deployed workers;
- real PostgreSQL cold-nonce initialization races and two deployed writers, with direct
  on-chain counts required to equal one per task;
- two deployed `TaskHistory` contracts, real log indexing and old/new direct read-back;
- five actual failures reaching the durable chain human-review queue;
- migration reversals on a dedicated role-free PostgreSQL cluster.

`npm run verify:evolution:schema` requires `EV_DATABASE_URL` for a disposable, dedicated
PostgreSQL cluster. It refuses application tables/operator roles, creates uniquely named
scratch databases, executes all discovered production migrations up/down, compares catalog
snapshots and surviving core data, exercises guarded rollback refusal, and cleans up its
databases/roles. It must fail rather than claim success when the database URL is absent.
The opt-in Vitest integration uses `EV_RUN_POSTGRES=1`; without it the integration is explicitly
skipped, not replaced by mock rows. The standalone CLI never silently skips.

EV-1/EV-2 traffic uses a frozen previous-release production GET repository behind a real
HTTP adapter while PostgreSQL lock inspection verifies overlap with an actual pending
production migration. It proves that read path, not a complete historical authenticated
deployment or old-version write traffic. Brief DDL locks can increase latency; "online"
does not mean lock-free. Foundational table drops intentionally lose those tables' data;
reversibility does not promise to recover deliberately dropped data without a backup.

The chain crash check uses a forwarding RPC proxy only to withhold the real node's
acknowledgement. It does not fabricate RPC replies, receipts, database rows, or contract logs.
Public Sepolia application writes and real provider mail remain manual gates.

The account-lifecycle unit slice is:

```powershell
npm run verify:account-lifecycle
```

This command proves durable deletion persistence, idempotent request reuse, expiring worker
leases, retry requeue, bounded retention cleanup, Todo anonymization, shared-task preservation,
and local chain cleanup.

After triggering account deletion and waiting for the worker, run the live proof:

```powershell
docker compose exec -T todo-service node apps/todo-service/scripts/verify-account-erasure.mjs <deletion-request-id> <user-id> <email>
```

It checks Account tombstone/completion state, Todo identity-linked rows and local chain
references, Gateway Redis authorization state, every configured broker queue and DLQ, and public
chain logs for the deleted account ID or email. Repeat the same idempotency key and stop either
participant before restarting it to prove idempotence and outage resume.

`npm run verify:authorization` proves the AUT-1 role/action table matches the built public contract.
It does not replace the workspace projection tests. The TN-6/TN-7 proof also runs middleware,
consumer, cache, signed-identity propagation, and Docker Compose end-to-end checks below.

## Policy verification

Run the policy check from a clean clone. It does not require the service stack.

```bash
npm ci
npm run verify:authorization
```

Expected final line:

```text
Authorization proof passed: 3 roles x 11 actions; AUT-1 matches the built public contract.
```

To prove that the check detects drift rather than merely producing green output, temporarily change
one `yes` to `no` in the AUT-1 permission table and rerun the command. It must exit non-zero with an
`AUT-1 disagrees with the executable policy` assertion. Restore the document and rerun; it must
pass. Do not commit the deliberate breakage.

## How to run the new integration-style authorization checks locally

These tests run without starting the full Docker stack by mocking external services and the
membership projection. They verify `authorizeWorkspace` behavior end-to-end inside the
Todo Service process.

From workspace root:

```bash
# run only the Todo Service tests that include the new auth checks
npm run test -w @todo/todo-service -- src/modules/todo/__tests__/workspace-authorization.e2e.test.ts
```

## TN-6/TN-7 verification

From PowerShell at the repository root, run unit/build checks first:

```powershell
npm run build:packages
npm run build -w @todo/gateway
npm run build -w @todo/todo-service
npm run test -w @todo/gateway -- src/security/__tests__/workspace-membership.consumer.test.ts src/security/__tests__/workspace-membership.cache.test.ts src/clients/__tests__/todo-service.client.test.ts src/middleware/__tests__/authenticate.middleware.test.ts
npm run test -w @todo/todo-service -- src/events/__tests__/workspace-membership.consumer.test.ts src/security/__tests__/workspace-membership.cache.test.ts src/middleware/__tests__/authorize-workspace.middleware.test.ts src/modules/todo/__tests__/workspace-authorization.e2e.test.ts
```

These checks prove the request path uses local projections, the original JWT `iat` is carried in
the signed Gateway-to-Todo identity, Redis writes are atomic/versioned, consumer ack follows writes,
prior tokens are denied, fresh tokens can be authorized, and Redis failure fails closed.

To run the full cross-service e2e suite (requires Docker Compose with Postgres, Redis, and RabbitMQ):

```bash
docker compose up -d --build
npm run test:e2e -w @todo/gateway -- --testNamePattern="revokes a prior token after workspace membership removal"
```

The TN-7 scenario logs observed propagation latency for role downgrade and membership removal,
then verifies a fresh token passes the re-added local projection while the original token remains
denied with `403 WORKSPACE_ACTION_FORBIDDEN` after re-add. It
requires the complete stack because Account Service persists the change and publishes the event,
RabbitMQ delivers it, and Gateway applies it to Redis.

## AUT-2 to AUT-5 verification

```powershell
npm run verify:authorization
```

This command independently checks the canonical policy source and enforcement middleware (AUT-2),
the documented non-matrix invariants and source anchors (AUT-3), the documented 15-second
propagation bound (AUT-4), and refusal/non-disclosure semantics (AUT-5). It fails when the
authorization document or the anchored implementation paths drift.

## PF-1 two-instance verification

The Compose file configures two replicas for every stateless process. The host-facing port is
owned by the Nginx `edge` service; Gateway replicas are internal workers behind that edge.
Run this proof manually:

```powershell
docker compose -f docker-compose.yml -f docker-compose.day4.yml up -d --build --scale gateway=2 --scale account-service=2 --scale todo-service=2 --scale todo-outbox-worker=2 --scale account-outbox-worker=2 --scale account-cleanup-worker=2 --scale todo-cleanup-worker=2 --scale todo-owner-consumer=2 --scale account-notification-consumer=2 --scale todo-history-worker=2
docker compose ps
npm run test:e2e -w @todo/gateway
docker compose down -v
```

The proof passes only when both replicas of every named stateless process remain healthy and the
E2E suite produces the same result with competing workers.

## Worker restart and reconnect verification

Run these commands while the scaled stack is running:

```powershell
docker compose -f docker-compose.yml -f docker-compose.day4.yml restart todo-owner-consumer todo-history-worker account-notification-consumer todo-outbox-worker account-outbox-worker
docker compose -f docker-compose.yml -f docker-compose.day4.yml ps
docker compose -f docker-compose.yml -f docker-compose.day4.yml logs --since 2m todo-owner-consumer todo-history-worker account-notification-consumer todo-outbox-worker account-outbox-worker
npm run test:e2e -w @todo/gateway
```

Then verify broker reconnect behavior:

```powershell
docker compose -f docker-compose.yml -f docker-compose.day4.yml stop rabbitmq
docker compose -f docker-compose.yml -f docker-compose.day4.yml ps
docker compose -f docker-compose.yml -f docker-compose.day4.yml up -d --wait rabbitmq
docker compose -f docker-compose.yml -f docker-compose.day4.yml restart todo-owner-consumer todo-history-worker account-notification-consumer todo-outbox-worker account-outbox-worker
docker compose -f docker-compose.yml -f docker-compose.day4.yml ps
docker compose -f docker-compose.yml -f docker-compose.day4.yml logs --since 2m todo-owner-consumer todo-history-worker account-notification-consumer todo-outbox-worker account-outbox-worker
npm run test:e2e -w @todo/gateway
```

The proof passes only when restarted workers return to `Up`, RabbitMQ reports healthy before
workers reconnect, consumers reconnect after RabbitMQ returns, outbox rows are not lost, and
E2E passes after recovery. The Day 4 override file raises only verification rate limits so the
full scaled E2E client does not become its own rate-limit failure.

## PF-7 slow dependency isolation

The notification worker is isolated from the request path. SMTP connection, greeting, and socket
timeouts are bounded by `MAIL_CONNECTION_TIMEOUT_MS`, `MAIL_GREETING_TIMEOUT_MS`, and
`MAIL_SOCKET_TIMEOUT_MS`. RabbitMQ notification prefetch is bounded by
`RABBITMQ_NOTIFICATION_PREFETCH`, so a slow provider cannot create unlimited in-flight work.
Failures remain in the existing retry/DLQ path and the originating business request is not held
open by mail delivery.

Automated local mail-dependency proof (no external provider or hand-started stack):

```powershell
npm run verify:mail
```

This command forces `MAIL_TEST_SINK_ONLY=true`, uses fresh generated credentials
and ephemeral published ports for its own Compose project, and checks that
Mailpit is the only configured SMTP host before sending a request. It registers
one test account, stops Mailpit, requests a reset over the public Gateway API,
asserts `202` without waiting for mail, proves authenticated TODO read/write
still work during the outage, observes retry and terminal DLQ state,
restarts Mailpit, replays that event with the operator command, and confirms
the message summary in Mailpit. It checks no token or mail body in its output,
then removes only its own project and volumes. It is also called by
`npm run verify:day4`. External provider throttling needs the separate live
provider gate; this command must never contact one.

### Stage 6 manual delivery result

On 2026-10-02 the operator reported receiving a password-reset email through
Brevo external mode at a registered, operator-controlled inbox. The one-time
token was used privately and the confirm endpoint returned HTTP 204. The same
reset flow was also tested in sink mode. This manual result is separate from
automated tests: `npm run verify:mail` remains sink-only and no test contacts
Brevo. Retain any receipt outside the repository in redacted form; do not record
the recipient address, token, message body, SMTP key, or raw provider response.
Brevo Free's 300-message daily quota, personal-email-only signup without a
card or company domain, and post-test SMTP-key replacement are operator-reported.

For manual inspection of the same failure path:

```powershell
docker compose up -d --build
docker compose stop mailpit
# Trigger a TODO share or password-reset request from a separate client.
docker compose ps
docker compose logs --since 2m account-notification-consumer-1 account-notification-consumer-2
docker compose start mailpit
```

The mail portion passes when the triggering request completes without waiting for Mailpit,
notification workers remain bounded, failed delivery is retried then dead-lettered,
and operator replay delivers after Mailpit returns. The chain portion is verified separately.

## PF-8 and PF-9 capacity verification

```powershell
npm run verify:capacity
```

This command checks that every stateless process declares two replicas, that Compose exposes the
configured pool/prefetch/batch/rate-limit values, and that `docs/capacity.md` contains the matching
calculations. The scaled E2E proof above verifies that one caller's traffic does not change the
business result received by other callers. The PF-7 Mailpit failure injection verifies that a slow
mail dependency remains outside the request path.

Backfill dry-run

```bash
node apps/todo-service/scripts/backfill-workspaces.mjs --dry-run
node apps/todo-service/scripts/backfill-workspaces.mjs --apply   # to perform updates
```

The clean-clone Compose proof is:

```bash
docker compose exec -T todo-service node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key "$INTERNAL_SERVICE_SECRET" --apply
docker compose exec -T todo-service node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key "$INTERNAL_SERVICE_SECRET"
```

The apply operation updates only rows whose `workspace_id` is NULL, so rerunning it is safe.
Owners with zero or multiple workspaces remain unchanged and are reported in `/tmp`.

The real PostgreSQL last-administrator concurrency proof is:

```bash
docker compose exec -T account-service node apps/account-service/scripts/verify-workspace-concurrency.mjs
```

For code-level inspection, verify that endpoints will import the public function rather than role
strings once enforcement is implemented:

```bash
rg -n 'canPerform|role\s*===' apps packages
```

At the present stage this finds the shared policy and its proof only. After endpoint enforcement is
added, every authorization decision must call `canPerform`; a direct endpoint comparison such as
`role === "administrator"` is a review failure.

## Automated coverage

The Gateway E2E suite covers authentication enforcement, request IDs, registration/login, TODO create/list/get/update/delete, pagination, state filtering, sorting, idempotent creation, duplicate-title concurrency, cross-owner isolation, cache freshness, sharing, and invalid UUID/query input. Unit suites cover validation, error mapping, cache hit/miss/fallback, rate limits, token verification, sessions, outbox logic, and consumers.

The isolation rule is verified for get, update, and delete: an inaccessible TODO returns the same `404 TODO_NOT_FOUND` as a missing TODO.

## Requirement coverage

| Requirement area | Automated evidence |
|---|---|
| FR-1 to FR-9 | Gateway E2E sharing, visibility, recipient permissions, withdrawal, and self-share scenarios. |
| FR-10 | Gateway E2E idempotency retry and concurrent duplicate-title scenarios. |
| FR-11 to FR-14 | History E2E, history consumer tests, email-change service tests, and owner-projection tests. |
| AC-1 to AC-8 | Login, refresh rotation, token reuse, logout, logout-all, and revoked-access tests. |
| AC-9 to AC-16 | Password-reset service/repository tests for expiry, single use, hashing, session revocation, and rate limits. |
| AC-17 to AC-24 | Notification consumer, mailer, outbox retry/DLQ, current-email lookup, and Mailpit E2E verification. |
| ER-2 to ER-6 | Outbox, duplicate-delivery, processed-event, retry, and dead-letter tests. |
| IR-2 to IR-6 | Gateway client timeout, connection failure, downstream status mapping, and malformed-response tests. |
| RR-1 to RR-9 | Container stop/restart checks in the failure-test table below. These require runtime execution, not unit tests alone. |
| SR-3 to SR-8 | Gateway E2E isolation, permissions, revocation, email-change, and reset-token tests. |
| AUT-1 | `npm run verify:authorization`; compares every Markdown permission cell with the built public contract. |
| DG-1, DG-2, DG-3, DG-8 | Deletion repository tests plus `verify-account-erasure.mjs`; checks durable request, cross-service cleanup, anonymized history, shared-task preservation, and local chain cleanup. |
| DG-4 | `verify-account-erasure.mjs` checks Account, Todo, Gateway, broker, and chain state together. |
| DG-5 | Gateway export route, Account/Todo export endpoints, package contract build, and API documentation. |
| DG-6 | Account cleanup repository tests and configured retention cutoffs. |
| DG-7 | Credential redaction and hash-storage tests. |
| DG-9, DG-10 | Durable leased worker retry tests, broker purge tests, and the stop/restart live proof above. |

## Failure tests

The distributed requirements also need container-level checks. Stop and restart each dependency while the stack is running and verify:

| Failure | Expected observation |
|---|---|
| Redis | Non-authorization TODO behavior follows its documented fallback; workspace authorization returns `503` and never fails open |
| Todo PostgreSQL | Todo process stays alive, readiness becomes unhealthy, recovery occurs after PostgreSQL returns |
| Account Service | Existing projected TODO reads continue; dependent calls return `503`/`504` |
| History worker | TODO mutations continue; history catches up after restart |
| RabbitMQ | Outbox rows remain pending and publish after RabbitMQ returns |
| Mailpit | Triggering action succeeds; notification retries and later appears in Mailpit |

Event tests must include duplicate delivery, consumer failure, retry, and dead-letter behavior. Credential tests must include refresh-token reuse, expired reset tokens, and reset-token reuse. Downstream client tests must include both timeout and connection-unavailable cases.

## Clean test state

Unit tests use isolated fixtures and mocks. E2E runs use disposable database/cache/message-broker state or explicitly reset fixtures so one run cannot affect the next. No test should require a developer to start a process by hand beyond the documented Compose command.
