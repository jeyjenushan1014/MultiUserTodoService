# Testing Strategy

## Test levels

| Test level | Purpose |
|---|---|
| Validation unit tests | Verify accepted and rejected request shapes |
| Service unit tests | Verify business outcomes and error mapping |
| Cache decorator tests | Verify hit, miss and fallback behaviour |
| Cache-version tests | Verify durable version parsing |
| End-to-end tests | Verify the complete deployed request path |
| Manual failure tests | Verify dependency outage behaviour |

## Normal test command

```bash
npm run check
```

This command runs:

- ESLint.
- TypeScript build.
- Unit tests.

It does not require Docker infrastructure.

## End-to-end command

Start the Docker stack and run:

```bash
npm run test:e2e
```

## Core E2E coverage

- Authentication enforcement.
- Request-ID propagation.
- TODO creation.
- Input normalization.
- Same-owner duplicate-title rejection.
- Different-owner identical-title support.
- Concurrent duplicate-title handling.
- Owner-scoped listing.
- Pagination metadata.
- State filtering.
- Creation-date sorting.
- Owner-scoped get.
- Uniform cross-owner not-found behaviour.
- Partial update.
- Cache freshness after update.
- Cross-owner update protection.
- Cross-owner delete protection.
- Soft deletion.
- Cache freshness after delete.
- Repeated-delete behaviour.
- Invalid query rejection.
- Invalid UUID rejection.

## Failure-path coverage

The following dependency failures are manually verified:

- Redis unavailable.
- Redis recovery after mutation.
- TODO PostgreSQL unavailable.
- TODO Service unavailable.
- Account Service unavailable.
- RabbitMQ unavailable.

## Isolation rule

All cross-owner Get, Update and Delete operations return:

```text
404 TODO_NOT_FOUND
```

The API does not reveal whether another owner’s TODO exists.

## Concurrency rule

Concurrent same-owner requests using the same normalized active title produce:

```text
One successful creation
One 409 TODO_TITLE_ALREADY_EXISTS
```

The PostgreSQL partial unique index provides the final concurrency guarantee.