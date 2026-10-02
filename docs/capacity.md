# Capacity and Caller Isolation

Updated: 2026-09-30

## PF-8 Calculations

The local Day 4 runtime uses two replicas for every stateless process. Values are intentionally
explicit rather than inherited from library defaults.

| Resource | Per-instance value | Instances | Aggregate bound | Calculation |
|---|---:|---:|---:|---|
| Account PostgreSQL pool | 10 connections | 2 | 20 | `2 replicas * 10` |
| Todo PostgreSQL pool | 10 connections | 2 | 20 | `2 replicas * 10` |
| Owner projection prefetch | 10 messages | 2 | 20 | `2 consumers * 10` |
| Notification prefetch | 10 messages | 2 | 20 | `2 consumers * 10` |
| Notification retry | 2 planned retry stages per logical event | 2 consumers | 3 planned send attempts per event | 30-second then 60-second delay; at most one expected attempt is claimable per event, with a 300-second recovery lease. Crash recovery may create duplicate broker copies, fenced by the DB claim. |
| History consumer prefetch | RabbitMQ consumer default, one handler per delivery | 2 | 2 active handlers per queue delivery stream | Durable queue and manual acknowledgement bound in consumer |
| Account outbox batch | 20 rows | 2 | 40 rows per polling round | `2 workers * 20` |
| Todo outbox batch | 25 rows | 2 | 50 rows per polling round | `2 workers * 25` |
| Owner rebuild batch | 100 rows | 1 maintenance run | 100 rows per transaction unit | Bounded maintenance work |
| Cleanup batch | 100 rows | 2 | 200 rows per interval | `2 workers * 100` |
| General API rate limit | 100 requests / 60 seconds | per caller | 100 per caller/window | Shared Redis counter |
| Auth rate limit | 10 requests / 60 seconds | per caller | 10 per caller/window | Shared Redis counter |
| Password-reset rate limit | 5 requests / 900 seconds | per caller | 5 per caller/window | Shared Redis counter |
| Mail recipient quota | 5 distinct events / rolling 24 hours | 2 consumers | 5 per normalized address across both | PostgreSQL address advisory transaction lock plus unique `(event_id, email)` reservation; retry reuses a slot. Each worker holds one DB client during send, so the two consumers share a maximum of 20 pool connections. |

Database pool totals stay below the default PostgreSQL connection budget reserved for the two
application databases. RabbitMQ prefetch and batch sizes bound in-flight work; PostgreSQL row locks,
outbox ownership, processed-event constraints, idempotency keys, and Redis counters prevent replica
count from changing business results.

The values are checked by `npm run verify:capacity`. Any change to a configured value or this table
must update both the calculation and the verifier.

## PF-9 Caller Isolation

Caller isolation is enforced by:

- Gateway Redis rate-limit keys scoped by caller identity or network identity.
- Separate authentication and password-reset limits.
- Request body and downstream timeouts.
- Bounded database pools.
- RabbitMQ prefetch limits.
- Durable outbox ownership locks.
- Idempotency keys for retried TODO creation.
- Per-event deduplication and notification delivery claims.

Manual proof must show that one caller exhausting its general limit does not prevent another caller
from reading or writing a TODO, and that a slow notification dependency does not block a TODO request.
Automated rate-limit unit tests and the scaled E2E suite are the regression checks; the slow-Mailpit
failure injection is documented in `docs/testing.md`.
