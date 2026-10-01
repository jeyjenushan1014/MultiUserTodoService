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
watermarks prevent older events or tokens from restoring stale access.

## 6. Cache and consistency

Owner-only TODO reads use Redis, keyed by the owner and query/resource identity. Cache entries expire and mutations invalidate affected entries. Shared-access reads remain PostgreSQL-backed because share withdrawal can change authorization independently of the owner cache version. Durable cache-version state in Todo PostgreSQL prevents stale owner values surviving invalidation races. Redis failure falls back to PostgreSQL; the cache is never the source of truth.

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

## Local on-chain contract milestone

`contracts/onchain` contains a Hardhat 3 / Solidity 0.8.28 project for a minimal public
`TaskHistory` record. Its build exports a generated ABI into Todo Service source. The local
Hardhat test suite and chain-31337 deployment are documented in `onchain.md`. This is not yet a
running platform component: there is no production chain writer, nonce coordinator, chain reader,
public-testnet address, or finality state. TODO requests do not wait for mining today because
they do not submit chain transactions yet, not because BC-10 has been demonstrated.
