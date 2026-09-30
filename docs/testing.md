# Testing and Verification

## Automated commands

```bash
npm run check
npm run test:e2e
npm run verify:authorization
```

`npm run check` runs lint, TypeScript builds, and unit tests without requiring manually started infrastructure. `npm run test:e2e` exercises the public Gateway path against the Docker stack.

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
