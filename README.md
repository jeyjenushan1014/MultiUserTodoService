# Multi-User TODO Platform

A TypeScript monorepo that splits the TODO domain into independently deployable Account Service, Todo Service, and Gateway processes. PostgreSQL is the source of truth, Redis provides cache and shared counters, RabbitMQ carries durable integration events, and Mailpit captures local email.

## Architecture

- **Gateway**: the only client entry point on `http://localhost:3000`; verifies JWTs, enforces rate limits, signs internal caller identity, and routes requests.
- **Account Service**: owns users, passwords, sessions, refresh tokens, password resets, and account events.
- **Todo Service**: owns TODOs, sharing, authorization, account projections, idempotency, cache-backed reads, and history.
- **Workers**: publish transactional outboxes, build projections, send notifications, and record task history.

Start with [docs/architecture.md](docs/architecture.md), then see [docs/architecture-diagram.md](docs/architecture-diagram.md) and [docs/architecture-decisions.md](docs/architecture-decisions.md).

## Quick start

Prerequisites: Node.js LTS, npm, Docker Desktop, and Git.

1. Copy `.env.example` to `.env` and set the required credentials and secrets.
2. Start the complete stack, including migration jobs:

```bash
docker compose up --build
```

The public API is available at `http://localhost:3000`. Mailpit is available at `http://localhost:8025`; RabbitMQ management is available at `http://localhost:15672`.

The Compose file runs account and TODO migrations before the dependent services. No direct client access to Account Service or Todo Service is required.

## Development commands

```bash
npm install
npm run check
npm run test:e2e
npm run test:docs
npm run build
npm run lint
npm test
```

`npm run check` runs linting, TypeScript builds, and unit tests. `npm run test:e2e` exercises the Gateway against the running Docker stack. Use `npm run clean` to remove generated build output.
`npm run test:docs` verifies that every public Gateway endpoint and required API flow is present in `docs/api.md`.

## Documentation

- [Public API](docs/api.md): every Gateway endpoint, request, response, status, error, and user flow.
- [Architecture](docs/architecture.md): service boundaries, data ownership, consistency, resilience, and observability.
- [Architecture diagram](docs/architecture-diagram.md): Mermaid topology with synchronous and asynchronous flows.
- [Architecture decisions](docs/architecture-decisions.md): why RabbitMQ, transactional outboxes, projections, signed identity, sessions, Redis, and Mailpit were selected.
- [Event catalogue](docs/events.md): event envelopes, payloads, consumers, retries, dead-letter queues, and email triggers.
- [Testing](docs/testing.md): automated commands, coverage, and dependency-failure verification.
- [Questions](docs/QUESTIONS.md): implementation questions, decisions, and unresolved limitations.
- [Legacy Day 2 API](docs/legacy/day2-monolith-api.md): historical single-service contract only.

## Security notes

Passwords are hashed. Refresh and password-reset credentials are opaque, expiring, single-use values stored only as hashes. Secrets are supplied at runtime and must never be committed or logged. Mailpit is the only email transport used for local verification; no real mailbox is contacted.
