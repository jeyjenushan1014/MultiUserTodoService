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
| `producer` | string | Emitting service. Currently `account-service` or `todo-service` |
| `requestId` | UUID | Request that caused the domain change |
| `occurredAt` | ISO-8601 datetime | Time of the committed domain change |
| `payload` | object | Event-specific data |

## 3. Account events

### `account.registered` versions 1 and 2

Published by Account Service after the user row and outbox row commit. Consumed by Todo owner projection. Both versions retain the same meanings for `userId` (the account identity) and `email` (the account's current email at registration). The consumer upserts `todo_owners`; duplicate delivery leaves the same projection state. Failure is retried and eventually sent to the owner-projection DLQ.

| Version | Payload | Status |
|---|---|---|
| 1 | `userId: UUID`, `email: string` | Historical messages may remain in the broker during rollout; Todo Service continues to accept them. |
| 2 | `userId: UUID`, `email: string`, `registrationMethod: "password"` | Current Account Service producer version. The new field is additive; it does not change the meaning of either v1 field. |

The Todo consumer accepts v1 and v2 concurrently. Unknown additive envelope or payload fields are stripped and ignored. Incompatible changes require a new version and an overlap period where consumers accept both versions.

### `account.email-changed` version 1

Published after the account email changes and the outbox row commits. Consumed by Todo owner projection. Payload: `userId: UUID`, `email: string`. The consumer updates the local email projection. During propagation, TODO responses may briefly show the previous email, but authorization uses stable user IDs.

### `workspace.membership-changed` version 1

Published by Account Service in the same PostgreSQL transaction as
workspace-membership creation, role change, or removal.

Payload:

| Field | Type | Meaning |
|---|---|---|
| `workspaceId` | UUID | Workspace whose membership changed |
| `userId` | UUID | Account whose membership changed |
| `role` | `administrator`, `editor`, `viewer`, or `null` | Current role; `null` means removed |
| `changedAt` | ISO-8601 datetime | Time the membership authority changed |

Initial workspace creation publishes the creator's administrator membership.

Planned consumers are Gateway and Todo Service local membership projections.
Those consumers are not implemented in this commit.

Version 1 field meanings are immutable. Unknown additive fields must be ignored
by future consumers.

## 4. TODO events

All are produced by Todo Service after the related TODO/share mutation and outbox insertion commit. All are consumed by Todo history worker.

### `todo.created` version 1

Payload: `todoId`, `ownerId` (UUIDs), and `title` (string). Published for a successful create. History records creation.

### `todo.completed` version 1

Payload: `todoId`, `ownerId`, and `completedByUserId` (UUIDs). Published only when state changes into `completed`; updating an already completed TODO does not publish another completion event.

### `todo.shared` version 1

Payload: `shareId`, `todoId`, `ownerId`, and `recipientId` (UUIDs). Consumed by Account Service notification consumer, which sends the sharing email to the recipient email currently known by Account Service. History records the share.

### `todo.share-withdrawn` version 1

Payload: `shareId`, `todoId`, `ownerId`, and `recipientId` (UUIDs). History records withdrawal. Authorization checks the active share row immediately, so the event is not required for access revocation.

### `todo.deleted` version 1

Payload: `todoId`, `ownerId`, and `deletedByUserId` (UUIDs). History records deletion.

## 5. Consumer failure and duplication

Consumers acknowledge only after their database or mail work succeeds. A duplicate event is safe because event IDs are unique and handlers use upsert or unique processing constraints. A failed history message goes to `todo.history.dlq`; notification failure goes to `todo.notifications.dlq`; owner projection failure goes to `todo.owner-projection.dlq` after bounded retries.

## 6. Evolution rules

Existing event versions are immutable. Additive fields may be introduced only when old consumers can ignore them. A breaking payload change creates a new event version and keeps consumers capable of handling the prior version during rollout. Event type names and field meanings remain consistent across contracts, code, logs, and this document.

Automated compatibility evidence: `npm run test -w @todo/todo-service -- event-evolution.compatibility.test.ts`. The test imports Account Service's real v2 producer factory and validates its output with Todo Service's separately maintained consumer schema. It also verifies concurrent v1/v2 acceptance, unknown-field handling, and stable v1 field meanings.

## 7. Email catalogue

| Email | Trigger | Recipient and content |
|---|---|---|
| Password reset | Account Service publishes `account.password-reset-requested` | Current account email, only if it matches the event address; contains a reset token and expiry, never a password or access token |
| TODO shared | Account notification consumer processes `todo.shared` | Recipient's current account email at send time; contains the TODO ID and `state-update` permission label, but no owner identity |
| TODO share withdrawn | Account notification consumer processes `todo.share-withdrawn` | Recipient's current account email at send time; contains the TODO ID |

Mailpit is the current SMTP sink. It captures every message at `http://localhost:8025`;
no message leaves the developer machine on the default configuration. A failed
delivery enters `todo.notifications.retry` for a 30-second and then a 60-second
delay; after three failed sends, it enters `todo.notifications.dlq`. The
`x-notification-attempt` header carries the attempt across process restarts;
malformed notification events dead-letter immediately. PostgreSQL delivery claims
prevent simultaneous sends from two workers. The queue/DB handoffs use RabbitMQ
publisher confirms; replay from the DLQ requires the operator command in
`docs/operations.md`. Before each send, Account Service checks the current
registered recipient and reserves one of five address slots per rolling 24
hours; retries reuse the same slot. An over-limit message is set aside in the
DLQ instead of being sent. Every listed email goes to exactly one configured
destination, never both. Mailpit is the default; the external SMTP adapter is
implemented and disabled by default. On 2026-10-02 the operator reported
receiving a password-reset message through external mode and successfully
confirming its one-time token with HTTP 204; the sink-mode reset flow was also
tested. No recipient address, token, or message content is recorded here.
When an event first reaches delivery, its destination is pinned to the
current shared mode (`sink` by default). Retries and DLQ replay keep that
destination. A later mode change never redirects a sink-pinned event to the
provider or a provider-pinned event to Mailpit; switching external off stops
all further provider sends, and paused external events are eventually put
in the DLQ. The operator reports Brevo Free allows 300 messages per day;
no-card/no-domain eligibility still needs to be recorded in the Stage 6
evidence before ML-2 is complete.

# Workflow transport note

Workspace provisioning does not add a broker event. Its Account, Todo, and Gateway participant
commands are authenticated internal HTTP requests carrying the immutable workflow correlation ID.
Their durable retry source is the Account Service workflow table, rather than a transient HTTP
request or a second message contract. This distinction is intentional and documented here so the
commands are not mistaken for uncatalogued events.

## Contract event: `TaskActionRecorded` (TaskHistory v1)

This event is emitted by `recordTaskAction` in `contracts/onchain/contracts/TaskHistory.sol`.
It is an EVM log, **not** a RabbitMQ message; no backend chain reader currently consumes it.

| Parameter | ABI type | Indexed | Meaning |
|---|---|---|---|
| `taskId` | `bytes16` | yes | Opaque task identifier |
| `workspaceId` | `bytes16` | yes | Opaque workspace identifier |
| `action` | `uint8` (`Action`) | no | `Created = 0`, `Updated = 1`, `Deleted = 2` |
| `timestamp` | `uint64` | no | Timestamp of the containing block, not the original request time |

The local contract test proves the event's four-value shape. Before public deployment, verify
that the IDs sent as inputs do not identify people. A future chain reader must rebuild from
canonical logs and remove orphaned projections after a chain reorganisation; confirmations,
duplicate-event handling, and reader/rebuild commands are not yet implemented. Existing TODO
broker events contain account IDs or titles and must never be forwarded to this contract.
