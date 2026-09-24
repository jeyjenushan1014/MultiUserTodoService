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
