# Architecture Decisions and Rationale

## Decision 1: Three business services behind one Gateway

Account ownership and TODO ownership change independently, so they are separate deployable services with separate databases. The Gateway provides one client entry point and a stable public contract. This matters because clients do not need service discovery and a service can be rebuilt or stopped without exposing its internal port.

## Decision 2: RabbitMQ with transactional outboxes

RabbitMQ was selected because durable queues, persistent messages, publisher confirms, acknowledgements, retries, and dead-letter exchanges directly support the event requirements. Events are first written to the owning service's database in the same transaction as the business mutation; workers publish them later. This matters because a crash between commit and publish leaves a durable outbox row instead of losing the event or publishing an event for a rolled-back change.

## Decision 3: Local projections instead of cross-service database reads

Todo Service owns `todo_owners`, copied from account events. It never reads Account PostgreSQL. This matters because schemas can evolve independently, account downtime does not block existing TODO reads, and the projection is rebuildable from published events. The cost is temporary email staleness, which is acceptable because authorization uses stable IDs.

## Decision 4: Signed internal identity

The Gateway verifies the user JWT and signs a short-lived internal identity containing user ID, session ID, email, and request ID. Services verify the signature and reject direct or altered requests. This matters because downstream services know who the caller is without a synchronous account lookup on every request, while a client cannot forge identity claims.

## Decision 5: Database-backed session state plus JWTs

JWTs provide efficient request identity, but session state provides immediate revocation. Logout, logout-all, password reset, and refresh-token reuse detection invalidate session state; services reject tokens whose session is no longer active. Refresh tokens are opaque, hashed, expiring, and single-use. This matters because signature validity alone cannot satisfy immediate logout or stolen-credential detection.

## Decision 6: Redis as an optional optimization

Redis holds rate-limit counters and TODO read cache entries. PostgreSQL remains authoritative. Cache keys include caller/query scope, entries expire, and mutations invalidate them. This matters because Redis loss degrades performance and rate-limit strictness but cannot return another user's data or lose accepted work.

## Decision 7: Mailpit for local email

Mailpit is an SMTP sink with a browser UI. It makes every reset and sharing email inspectable without a real mailbox or external provider. Email is processed asynchronously from events, retried, and dead-lettered. This matters because email outages cannot roll back a successful TODO share or password-reset request.

## Decision 8: Stable event envelope and versioning

Every event carries event ID, type, version, producer, request ID, timestamp, and a typed payload. Event IDs support idempotency and request IDs support logs-to-event tracing. Versions are immutable; breaking changes create a new version. This matters because consumers can be deployed independently and a second consumer can subscribe without changing the publisher.

## Tradeoffs and consistency windows

The design intentionally accepts eventual consistency for account projections, notifications, and history. It does not accept eventual consistency for authorization: active share state is checked by Todo Service on each protected operation. Synchronous account lookup is used only when sharing by email because the recipient must be resolved before the share can be committed; it has a bounded timeout and returns a service-unavailable error rather than pretending the account does not exist.
