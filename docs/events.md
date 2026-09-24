# Integration Event Catalogue

## 1. Transport and guarantees

RabbitMQ topic exchange `todo.events` carries durable, persistent messages. Publishers use confirmations. Each consumer has a durable queue; failures are negatively acknowledged and routed through retry or dead-letter queues. A message that cannot be processed is preserved for inspection rather than silently discarded.

The publisher is decoupled from consumers: the domain request commits its database transaction and outbox row whether or not a consumer is running. Consumers are idempotent. History deduplicates by `event_id`; projection and notification consumers use durable queue/state semantics.

## 2. Envelope

| Field | Type | Meaning |
|---|---|---|
| `eventId` | UUID | Globally unique event identity and deduplication key |
| `eventType` | string | Stable event name |
| `eventVersion` | positive integer | Payload schema version; current version is `1` |
| `producer` | enum | `account-service`, `todo-service`, `activity-service`, or `notification-worker` |
| `requestId` | UUID | Request that caused the domain change |
| `occurredAt` | ISO-8601 datetime | Time of the committed domain change |
| `payload` | object | Event-specific data |

## 3. Account events

### `account.registered` version 1

Published by Account Service after a user row and outbox row commit. Consumed by Todo owner projection. Payload: `userId: UUID`, `email: string`. The consumer upserts `todo_owners`; duplicate delivery leaves the same projection state. Failure is retried and eventually sent to the owner-projection DLQ.

### `account.email-changed` version 1

Published after the account email changes and the outbox row commits. Consumed by Todo owner projection. Payload: `userId: UUID`, `email: string`. The consumer updates the local email projection. During propagation, TODO responses may briefly show the previous email, but authorization uses stable user IDs.

## 4. TODO events

All are produced by Todo Service after the related TODO/share mutation and outbox insertion commit. All are consumed by Todo history worker.

### `todo.created` version 1

Payload: `todoId`, `ownerId`, `actorUserId` (UUIDs), and `title` (string). Published for a successful create. History records creation.

### `todo.completed` version 1

Payload: `todoId`, `ownerId`, and `actorUserId` (UUIDs). Published only when state changes into `completed`; updating an already completed TODO does not publish another completion event.

### `todo.shared` version 1

Payload: `todoId`, `ownerId`, `actorUserId`, `sharedWithUserId` (UUIDs), and `title` (string). Consumed by Account Service notification consumer, which sends the sharing email to the recipient email currently known by Account Service. History records the share.

### `todo.share-withdrawn` version 1

Payload: `todoId`, `ownerId`, `actorUserId`, and `sharedWithUserId` (UUIDs). History records withdrawal. Authorization checks the active share row immediately, so the event is not required for access revocation.

### `todo.deleted` version 1

Payload: `todoId`, `ownerId`, `actorUserId` (UUIDs), and `participantUserIds` (UUID array). The participant snapshot is included because the TODO no longer exists for a consumer to query. History records deletion for every participant-visible record.

## 5. Consumer failure and duplication

Consumers acknowledge only after their database or mail work succeeds. A duplicate event is safe because event IDs are unique and handlers use upsert or unique processing constraints. A failed history message goes to `todo.history.dlq`; notification failure goes to `todo.notifications.dlq`; owner projection failure goes to `todo.owner-projection.dlq` after bounded retries.

## 6. Evolution rules

Existing event versions are immutable. Additive fields may be introduced only when old consumers can ignore them. A breaking payload change creates a new event version and keeps consumers capable of handling the prior version during rollout. Event type names and field meanings remain consistent across contracts, code, logs, and this document.

## 7. Email catalogue

| Email | Trigger | Recipient and content |
|---|---|---|
| Password reset | Account Service creates a reset request | Current account email; contains a one-time reset credential/link, never a password or access token |
| TODO shared | Account notification consumer processes `todo.shared` | Recipient's current account email at send time; identifies the shared TODO and owner, but grants no continued access |

Mailpit is the local SMTP sink. It captures every message at `http://localhost:8025`; no message leaves the developer machine. Failed delivery is retried and then dead-lettered for inspection.
