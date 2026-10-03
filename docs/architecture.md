# Platform Architecture

## 1. Purpose

This document describes the architecture implemented in this repository. The system is a TypeScript monorepo containing independently buildable processes, separated by business ownership.

See [architecture-diagram.md](architecture-diagram.md) for the visual topology and [architecture-decisions.md](architecture-decisions.md) for the decisions and tradeoffs.

## 2. Services and ownership

| Component | Responsibility | Owns |
|---|---|---|
| Gateway | Public HTTP entry point, JWT enforcement, rate limiting, request correlation, downstream translation | No business data |
| Account Service | Registration, credentials, sessions, refresh rotation, password reset, profile, email, and workspace-membership source of truth | `users`, `sessions`, `refresh_tokens`, `password_reset_tokens`, `workspaces`, `workspace_members`, account `outbox_events` |
| Todo Service | TODO lifecycle, sharing, authorization, idempotent creates, projections, cache-backed reads, history | `todos`, `todo_shares`, `todo_owners`, `todo_idempotency_records`, `processed_events`, `todo_history`, todo `outbox_events` |
| Account outbox worker | Publishes account events | Account outbox rows |
| Todo outbox worker | Publishes todo events | Todo outbox rows |
| Todo owner consumer | Builds the Todo Service account projection | `todo_owners` |
| Account notification consumer | Sends password-reset, share, and share-withdrawal notifications | Notification queue, delivery claims, address-quota reservations, sink/provider transport selection |
| Todo history worker | Records immutable task activity | `todo_history` |
| Account deletion worker | Resumes leased account-erasure workflow and purges copies | `account_deletion_requests` |
| Chain submission/indexer code | Persists privacy-gated chain commands and projects confirmed contract logs | `chain_submissions`, nonce coordination, and chain projection tables; these worker processes are not part of the default Compose topology |

`@todo/contracts` contains public and integration contracts. `@todo/common` contains technical utilities. Neither shared package owns business data or business rules.

## 3. Trust boundaries and request flow

Clients can reach only the Gateway host port. The Gateway validates the JWT, checks session validity, applies Redis-backed limits, creates a signed internal identity, and calls the owning service. Internal services reject requests without a valid internal signature and do not trust caller-supplied identity fields.

Gateway-to-service calls use runtime-configured service URLs, a five-second timeout, and no retry for mutating work. A timeout becomes `504`; connection failure becomes `503`; malformed downstream data becomes `502`.

## 4. Data ownership and projections

Account PostgreSQL and Todo PostgreSQL are separate databases. No foreign key crosses that boundary. Todo Service keeps `todo_owners`, a projection of account ID and email populated by `account.registered` and updated by `account.email-changed`.

The projection is eventually consistent. A newly registered account can briefly be unavailable to TODO creation until its registration event is consumed. Existing TODO access uses the last valid projection while Account Service is down. The projection can be rebuilt by replaying account events into an empty Todo database.

## 5. Transaction and event guarantees

Each service writes its domain mutation and outbox row in one PostgreSQL
transaction. Workers publish outbox rows to RabbitMQ with persistent messages
and publisher confirms. Consumers use durable queues, manual acknowledgements,
deduplication, retry/DLQ policies, and durable state.

This transactional-outbox pattern means a crash can delay publication, but
cannot publish an event for a rolled-back mutation or commit a mutation without
leaving a publishable outbox row.

### 5.1 Workspace membership propagation

Account Service is the source of truth for workspace membership. Creating an
initial administrator, adding a member, changing a member's role, or removing a
member writes a `workspace.membership-changed` version 1 outbox row in the same
PostgreSQL transaction as the membership mutation.

The event payload contains only:

- `workspaceId`;
- `userId`;
- the member's current `role`, or `null` when the membership was removed; and
- `changedAt`.

The event does not contain an email address, name, workspace name, JWT, session
credential, or task content.

The Account outbox worker publishes committed membership events to RabbitMQ.
A workspace request does not wait for RabbitMQ and does not wait for another
service to process the event. If RabbitMQ is unavailable, the membership
mutation and its outbox row remain committed, and publication resumes through
the existing bounded outbox retry process.

The workspace repository serializes membership mutations for one workspace by
locking the workspace row before evaluating actor authority or the
last-administrator invariant. The outbox row is inserted before `COMMIT`. If
the outbox insertion fails, the membership mutation is rolled back.

### 5.2 Event version compatibility

Account registration events use an explicit overlap policy: Account Service
currently emits `account.registered` v2, while Todo Service accepts both v1 and
v2 so queued v1 messages remain processable during a rolling deployment. V2
adds `registrationMethod`; it does not redefine `userId` or `email`. Consumer
schemas strip unknown additive fields, so a newer producer can add optional
metadata without making an older consumer reject the event. A breaking change
must use a new `eventVersion`, and the consumer must accept both versions until
old messages and old producer instances are drained.

The producer-consumer contract is checked without starting either service:
`event-evolution.compatibility.test.ts` imports the Account Service's production
event factory and validates its output using Todo Service's independent Zod
consumer schema. The same test checks the historical v1 shape, v2, unknown
fields, and unchanged v1 field meanings.

### 5.3 Public API and rolling deployments

The public Gateway registration response retains the previous flat `data.id`,
`data.email`, and `data.createdAt` fields and also returns the current
`data.user` object. The Gateway constructs the flat aliases itself, so it also
preserves the old public response when an older Account Service returns only
`data.user`. Account and Gateway controller tests check both response shapes.

The event wire contract is compatible across Account Service producer versions:
v1 outbox messages and v2 messages can coexist, and the Todo consumer accepts
both. EV-8 was also exercised live on 2026-10-01 using distinct Account Service
images: old image from commit `3f0c3a2` and the current working tree. Both were
healthy at once, shared the same Account PostgreSQL database and RabbitMQ, and
accepted registration requests. The shared outbox contained the old instance's
`account.registered` v1 row and the new instance's v2 row.

Repeat the runtime proof with
`docker compose -f docker-compose.yml -f docker-compose.ev8.yml up -d account-service-ev8-old account-service-ev8-new`
followed by
`docker compose -f docker-compose.yml -f docker-compose.ev8.yml exec -T -e EV8_OLD_URL=http://account-service-ev8-old:3001 -e EV8_NEW_URL=http://account-service-ev8-new:3001 account-service-ev8-new npm run verify:ev8-live -w @todo/account-service`.
The verifier checks health, submits one unique registration to each version,
validates their respective response shapes, and checks the durable outbox rows.

Gateway and Todo Service consume these events into local Redis membership
projections. Authorization decisions use the local projection rather than a
synchronous Account Service request; membership cache versions and revocation
watermarks prevent older events or tokens from restoring stale access. Account
PostgreSQL is authoritative; its transactional outbox publishes the change,
then each service's RabbitMQ consumer updates its own Redis projection. The live
TN-7 test enforces a maximum 15-second propagation bound, including a request
already holding a token issued before the role/removal change.

## 5.4 Workspace-provisioning saga (ARC-9)

The caller triggers `POST /api/v1/workflows/workspace-provisioning`. Account
Service persists the workflow/steps and its private reservation, then the leased
worker creates the Todo reservation and Gateway Redis publication through
separate participant calls. Normal workspace/TODO reads remain hidden until all
three steps are complete. A permanent failure moves the workflow to
compensation; successful steps are undone in reverse order, and participant
undo operations are idempotent. Each local transaction commits before its
remote call. The detailed step/result states and live proof are in
`docs/distributed-workflow.md` and `docs/testing.md`.

## 5.5 Replica behavior and correctness (ARC-10)

The default Compose topology configures two instances of each stateless API and
worker. Shared PostgreSQL, Redis, and RabbitMQ hold coordination state; correctness
does not depend on which replica receives a request or claims a message.

| Process group | Effect of two instances | Correctness mechanism |
|---|---|---|
| Gateway, Account API, Todo API | Requests can be served by either replica. | Shared Redis limits/projections, PostgreSQL source-of-truth state, signed internal identity, and stateless HTTP handlers. |
| Account/Todo outbox publishers | Compete to publish committed rows. | PostgreSQL leases/row locks, publisher confirms, stable event IDs, consumer deduplication. |
| Membership, history, notification consumers | Compete for durable queue messages. | RabbitMQ acknowledgements, projection/event deduplication, notification event claims and recipient locks. |
| Workflow workers | Compete for durable saga steps. | Expiring PostgreSQL leases and `FOR UPDATE SKIP LOCKED`; idempotent participants and compensation. |
| Cleanup workers | Process bounded cleanup batches. | Transactional bounded batches and deletion/retention constraints. |

Configured replica, pool, prefetch, and batch values and calculations are in
`docs/capacity.md`; `npm run verify:capacity` checks the Compose values.

## 5.6 Chain submission and finality window (ARC-11)

Todo mutation repositories enqueue privacy-gated commands in `chain_submissions`
inside the same PostgreSQL transaction as the TODO mutation. The request does
not wait for mining. When the chain submission worker is deployed and enabled,
it moves submissions through `pending`, `reserved`, and `submitted` to a final
state (`confirmed`, `replaced`, `abandoned`, or `dead_letter`). The indexer
accepts records only at the configured safe head; `CHAIN_CONFIRMATIONS` defaults
to two and cannot be set below two. Until finality the append-only record is not
promised as confirmed. The default Compose file does not currently start the
chain submission or indexer workers, so the manual Sepolia demo proves the
contract directly, not end-to-end production API anchoring. See `docs/onchain.md`.

## 6. Cache and consistency

Owner-only TODO reads use Redis, keyed by the owner and query/resource identity. Cache entries expire and mutations invalidate affected entries. Shared-access reads remain PostgreSQL-backed because share withdrawal can change authorization independently of the owner cache version. Durable cache-version state in Todo PostgreSQL prevents stale owner values surviving invalidation races. Redis failure falls back to PostgreSQL; the cache is never the source of truth.

## 7. Sessions and credentials

The access JWT contains identity and session claims but is accepted only while the Account session remains active. Logout, logout-all, refresh-token reuse detection, and password reset revoke session state, so an otherwise valid old JWT stops working. Refresh and reset credentials are random opaque values; only hashes are stored.

## 7.1 Account export and deletion

`GET /api/v1/users/me/export` is a read-only Gateway aggregation. Account Service returns the
authenticated account and workspace memberships, while Todo Service returns owned/shared TODOs,
related shares, and relevant history. Both calls use signed internal identity and the export
fails rather than returning a partial document.

Account deletion is a durable leased workflow in `account_deletion_requests`. It revokes sessions
immediately, prepares workspace ownership, calls the Todo erasure participant, purges Gateway and
Todo caches plus configured RabbitMQ queues/DLQs, and then removes the Account record. Shared
workspaces and shared TODOs survive; orphaned empty workspaces and unshared personal TODOs are
removed. Retained history is anonymized and a tombstone prevents the deleted identity returning
to Todo projections.

The public chain is append-only, so historical blocks cannot be rewritten. Chain payloads are
opaque task/workspace identifiers and contain no account email or user ID. Pending local chain
submissions and local projection rows for deleted personal TODOs are removed; shared-task chain
history remains as anonymized operational history.

## 8. Availability and failure behavior

Services start with local configuration and do not require another service merely to start. Database pools have error handling and reconnect behavior. Downstream calls are bounded. RabbitMQ consumers and outbox workers restart independently under Compose.

| Failure | Expected result |
|---|---|
| Account Service stopped | Existing projected TODO reads continue; account-dependent operations fail as unavailable |
| Todo Service stopped | Account operations continue; TODO calls fail as unavailable |
| History worker stopped | TODO mutations continue; history catches up later |
| Redis stopped | General rate limiting fails open and TODO reads fall back to PostgreSQL; authentication and password-reset rate limiting fail closed with `503 RATE_LIMIT_UNAVAILABLE`. |
| RabbitMQ stopped | Domain writes remain in transactional outboxes; consumers/outbox workers reconnect and publication resumes. |
| Mailpit stopped in sink mode | Notification delivery is retried and eventually dead-lettered; business request succeeds. |
| External SMTP provider refuses/times out | Business request remains successful; notification is retried and eventually sent to the notification DLQ. External-provider fault injection is not yet demonstrated. |
| Chain RPC stopped | TODO mutation commits and returns without waiting for mining; chain submissions remain durable for a configured worker to retry. Default Compose does not start that worker. |
| PostgreSQL stopped | Service remains alive, reports unhealthy, and recovers after the database returns |

## 9. Operational topology

Compose starts two PostgreSQL containers, Redis, RabbitMQ, Mailpit, migration jobs, an Nginx
edge, two Gateway replicas, two Account Service replicas, two Todo Service replicas, and two
replicas of every outbox worker, consumer, and cleanup worker. Only the edge port `3000` is the
client API. The edge resolves the internal Gateway service through Docker DNS, so Gateway
replicas do not compete for a host port. PostgreSQL and migration jobs remain single-holder
components. Mailpit UI is at `http://localhost:8025`; RabbitMQ management is at
`http://localhost:15672` for local inspection.

### 9.1 PF-1 scale proof

The implementation declares `deploy.replicas: 2` for every stateless process. Run the following
commands to create the two-instance runtime and verify it; these commands are intentionally not
run by the code assistant because PF-1 is an operator/runtime proof:

```powershell
docker compose up -d --build --scale gateway=2 --scale account-service=2 --scale todo-service=2 --scale todo-outbox-worker=2 --scale account-outbox-worker=2 --scale account-cleanup-worker=2 --scale todo-cleanup-worker=2 --scale todo-owner-consumer=2 --scale account-notification-consumer=2 --scale todo-history-worker=2
docker compose ps
docker compose exec -T gateway wget -qO- http://localhost:3000/health
npm run test:e2e -w @todo/gateway
```

Expected evidence is two running containers for every named stateless process, one healthy
client-facing edge, and the same E2E result as the single-replica run. Queue workers use durable
queues and database/outbox idempotency so increasing replica count cannot duplicate accepted
business state.

Capacity calculations and caller-isolation controls are recorded in `docs/capacity.md` and checked
by `npm run verify:capacity`. The document derives pool, prefetch, batch, rate-limit, and replica
bounds from the configured values rather than treating library defaults as capacity planning.

## 10. Observability

Every request has a generated request ID. It is carried through Gateway logs, downstream requests, service logs, and event envelopes. Every log identifies its service and redacts passwords, tokens, reset credentials, and database secrets. Event IDs make asynchronous processing traceable and history deduplicable.

## Durable distributed workflow

Workspace provisioning uses the persisted saga described in
[`distributed-workflow.md`](distributed-workflow.md). Account Service owns workflow and step state;
Todo Service owns its reservation; Gateway owns a Redis publication record. Two workers safely
share work through expiring PostgreSQL leases and `SKIP LOCKED`. All ordinary state remains hidden
until the workflow is terminal, and every remote call occurs after the preceding local transaction
has closed.

## On-chain contract milestone

`contracts/onchain` is a Hardhat 3 / Solidity 0.8.28 project. `TaskHistory` is deployed locally
and to Sepolia; source verification, the Sepolia address, a two-confirmation synthetic write,
and direct read-back are recorded in `docs/onchain.md`. Backend code implements privacy-gated
chain submissions, nonce coordination, and a rebuildable event projection. However, chain
submission and indexer workers are not included in the default Compose topology, so production
TODO traffic has not been demonstrated writing to Sepolia. The manual demo proves the contract
directly and must not be presented as end-to-end production anchoring evidence.
