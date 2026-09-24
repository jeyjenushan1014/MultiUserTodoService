# Platform Architecture

## 1. Purpose

This document describes the architecture implemented in this repository. The system is a TypeScript monorepo containing independently buildable processes, separated by business ownership.

See [architecture-diagram.md](architecture-diagram.md) for the visual topology and [architecture-decisions.md](architecture-decisions.md) for the decisions and tradeoffs.

## 2. Services and ownership

| Component | Responsibility | Owns |
|---|---|---|
| Gateway | Public HTTP entry point, JWT enforcement, rate limiting, request correlation, downstream translation | No business data |
| Account Service | Registration, credentials, sessions, refresh rotation, password reset, profile and email | `users`, `sessions`, `refresh_tokens`, `password_reset_tokens`, account `outbox_events` |
| Todo Service | TODO lifecycle, sharing, authorization, idempotent creates, projections, cache-backed reads, history | `todos`, `todo_shares`, `todo_owners`, `todo_idempotency_records`, `processed_events`, `todo_history`, todo `outbox_events` |
| Account outbox worker | Publishes account events | Account outbox rows |
| Todo outbox worker | Publishes todo events | Todo outbox rows |
| Todo owner consumer | Builds the Todo Service account projection | `todo_owners` |
| Account notification consumer | Sends sharing notifications | Notification queue and Mailpit transport |
| Todo history worker | Records immutable task activity | `todo_history` |

`@todo/contracts` contains public and integration contracts. `@todo/common` contains technical utilities. Neither shared package owns business data or business rules.

## 3. Trust boundaries and request flow

Clients can reach only the Gateway host port. The Gateway validates the JWT, checks session validity, applies Redis-backed limits, creates a signed internal identity, and calls the owning service. Internal services reject requests without a valid internal signature and do not trust caller-supplied identity fields.

Gateway-to-service calls use runtime-configured service URLs, a five-second timeout, and no retry for mutating work. A timeout becomes `504`; connection failure becomes `503`; malformed downstream data becomes `502`.

## 4. Data ownership and projections

Account PostgreSQL and Todo PostgreSQL are separate databases. No foreign key crosses that boundary. Todo Service keeps `todo_owners`, a projection of account ID and email populated by `account.registered` and updated by `account.email-changed`.

The projection is eventually consistent. A newly registered account can briefly be unavailable to TODO creation until its registration event is consumed. Existing TODO access uses the last valid projection while Account Service is down. The projection can be rebuilt by replaying account events into an empty Todo database.

## 5. Transaction and event guarantees

Each service writes its domain mutation and outbox row in one PostgreSQL transaction. Workers publish outbox rows to RabbitMQ with persistent messages and publisher confirms. Consumers use durable queues, manual acknowledgements, deduplication, retry/DLQ policies, and durable state.

This transactional-outbox pattern means a crash can delay publication, but cannot publish an event for a rolled-back mutation or commit a mutation without leaving a publishable outbox row.

## 6. Cache and consistency

Todo reads may use Redis, keyed by caller and query/resource identity. Cache entries expire and mutations invalidate affected entries. Durable cache-version state in Todo PostgreSQL prevents stale values surviving invalidation races. Redis failure falls back to PostgreSQL; the cache is never the source of truth.

## 7. Sessions and credentials

The access JWT contains identity and session claims but is accepted only while the Account session remains active. Logout, logout-all, refresh-token reuse detection, and password reset revoke session state, so an otherwise valid old JWT stops working. Refresh and reset credentials are random opaque values; only hashes are stored.

## 8. Availability and failure behavior

Services start with local configuration and do not require another service merely to start. Database pools have error handling and reconnect behavior. Downstream calls are bounded. RabbitMQ consumers and outbox workers restart independently under Compose.

| Failure | Expected result |
|---|---|
| Account Service stopped | Existing projected TODO reads continue; account-dependent operations fail as unavailable |
| Todo Service stopped | Account operations continue; TODO calls fail as unavailable |
| History worker stopped | TODO mutations continue; history catches up later |
| RabbitMQ stopped | Domain writes remain in outboxes; publication resumes later |
| Redis stopped | Rate limiting fails open and TODO reads fall back to PostgreSQL |
| Mailpit stopped | Notification delivery is retried and eventually dead-lettered; business request succeeds |
| PostgreSQL stopped | Service remains alive, reports unhealthy, and recovers after the database returns |

## 9. Operational topology

Compose starts two PostgreSQL containers, Redis, RabbitMQ, Mailpit, migration jobs, three application processes, and independent workers/consumers. Only Gateway port `3000` is the client API. Mailpit UI is at `http://localhost:8025`; RabbitMQ management is at `http://localhost:15672` for local inspection.

## 10. Observability

Every request has a generated request ID. It is carried through Gateway logs, downstream requests, service logs, and event envelopes. Every log identifies its service and redacts passwords, tokens, reset credentials, and database secrets. Event IDs make asynchronous processing traceable and history deduplicable.
