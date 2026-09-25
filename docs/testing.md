# Testing and Verification

## Automated commands

```bash
npm run check
npm run test:e2e
```

`npm run check` runs lint, TypeScript builds, and unit tests without requiring manually started infrastructure. `npm run test:e2e` exercises the public Gateway path against the Docker stack.

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

## Failure tests

The distributed requirements also need container-level checks. Stop and restart each dependency while the stack is running and verify:

| Failure | Expected observation |
|---|---|
| Redis | TODO remains correct and available; reads fall back to PostgreSQL |
| Todo PostgreSQL | Todo process stays alive, readiness becomes unhealthy, recovery occurs after PostgreSQL returns |
| Account Service | Existing projected TODO reads continue; dependent calls return `503`/`504` |
| History worker | TODO mutations continue; history catches up after restart |
| RabbitMQ | Outbox rows remain pending and publish after RabbitMQ returns |
| Mailpit | Triggering action succeeds; notification retries and later appears in Mailpit |

Event tests must include duplicate delivery, consumer failure, retry, and dead-letter behavior. Credential tests must include refresh-token reuse, expired reset tokens, and reset-token reuse. Downstream client tests must include both timeout and connection-unavailable cases.

## Clean test state

Unit tests use isolated fixtures and mocks. E2E runs use disposable database/cache/message-broker state or explicitly reset fixtures so one run cannot affect the next. No test should require a developer to start a process by hand beyond the documented Compose command.
