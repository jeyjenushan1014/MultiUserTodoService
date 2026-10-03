# Integration Event Catalogue

The shared event envelope and TODO event schemas are defined in
`packages/contracts/src/todo/events/todo-event.contract.ts`; Account event
schemas are defined in the Account event contracts. Producers persist domain
changes and outbox records atomically. Consumers process at least once and
deduplicate by event identity.

## Version and consumer matrix (EVT-8 through EVT-10)

| Event | Versions emitted | Consumers and accepted versions |
|---|---|---|
| `account.registered` | v2 current; v1 retained for rollout | Todo owner projection accepts v1 and v2; compatibility test validates both. |
| `account.email-changed` | v1 | Todo owner projection. |
| `account.session-revoked` | v1 | Gateway session-revocation consumer. |
| `account.password-reset-requested` | v1 | Account notification consumer. |
| `workspace.membership-changed` | v1 | Gateway and Todo membership projection consumers. |
| `todo.created` | v1 | Todo history consumer. |
| `todo.completed` | v1 | Todo history consumer. |
| `todo.shared` | v1 | Todo history and Account notification consumers. |
| `todo.share-withdrawn` | v1 | Todo history and Account notification consumers. |
| `todo.deleted` | v1 | Todo history consumer. |

For each event, the shared envelope fields are `eventId`, `eventType`,
`eventVersion`, `producer`, `requestId`, `occurredAt`, and `payload`. Changes
must preserve existing field meanings; additive fields must be safely ignored;
breaking changes require a new event version and an overlap period. The
automated v1/v2 producer-consumer check is
`npm run test -w @todo/todo-service -- event-evolution.compatibility.test.ts`.
This test covers the registration producer/consumer pair, not every event pair;
the other payloads are independently defined in the shared contracts package,
so complete pairwise PR-3 automation remains a proof gap.

## Account events

### `account.registered` versions 1 and 2

Version 2 is current; version 1 remains supported during rollout. Todo Service's
owner projection accepts both versions. The automated compatibility test covers
this producer/consumer pair, not every event pair; see `docs/traceability.md`.

### `account.email-changed` version 1

Published after the account email update commits. Todo Service refreshes the
owner projection from the new account address.

### `account.session-revoked` version 1

Published when Account revokes a session. Gateway consumes it to update the
local session-revocation projection; requests do not make a synchronous Account
Service call for each authorization decision.

### `account.password-reset-requested` version 1

Published by Account Service after persisting a password-reset request and its
outbox event. The Account notification consumer checks the current registered
address and sends the reset email. Payload fields are `userId: UUID`,
`email: string`, `encryptedResetToken: string`, and `expiresAt: ISO-8601
datetime`. The reset token is encrypted in the outbox payload and decrypted
only for the send; plaintext reset tokens are not published.

## Workspace membership event: `workspace.membership-changed` version 1

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

Gateway and Todo Service each run a durable consumer bound to
`workspace.membership-changed`. Each consumer updates its local Redis membership
projection and acknowledges only after the projection update succeeds. Failed
messages are requeued; timestamp/version checks prevent an older event from
overwriting newer membership state. Authorization uses the local projections,
not a synchronous Account Service call.

Version 1 field meanings are immutable. Unknown additive fields must be ignored
by future consumers.

## TODO events

All are produced by Todo Service after the related TODO/share mutation and
outbox insertion commit. All are consumed by the Todo history worker; share
and share-withdrawal events are also consumed by the Account notification
consumer.

### `todo.created` version 1

Payload: `todoId`, `ownerId` (UUIDs), and `title` (string). Published for a successful create. History records creation.

### `todo.completed` version 1

Payload: `todoId`, `ownerId`, and `completedByUserId` (UUIDs). Published only when state changes into `completed`; updating an already completed TODO does not publish another completion event.

### `todo.shared` version 1

Payload: `shareId`, `todoId`, `ownerId`, and `recipientId` (UUIDs). The Account
notification consumer resolves the recipient's current registered address and
sends the sharing email; the history worker records the share.

### `todo.share-withdrawn` version 1

Payload: `shareId`, `todoId`, `ownerId`, and `recipientId` (UUIDs). The Account
notification consumer sends the withdrawal email to the current registered
recipient; the history worker records withdrawal. Authorization checks the
active share row immediately, so event delivery is not the access-revocation
mechanism.

### `todo.deleted` version 1

Payload: `todoId`, `ownerId`, and `deletedByUserId` (UUIDs). History records deletion.

## Consumer failure and duplication

Consumers acknowledge only after their database or mail work succeeds. A duplicate event is safe because event IDs are unique and handlers use upsert or unique processing constraints. A failed history message goes to `todo.history.dlq`; notification failure goes to `todo.notifications.dlq`; owner projection failure goes to `todo.owner-projection.dlq` after bounded retries.

## Evolution rules

Existing event versions are immutable. Additive fields may be introduced only when old consumers can ignore them. A breaking payload change creates a new event version and keeps consumers capable of handling the prior version during rollout. Event type names and field meanings remain consistent across contracts, code, logs, and this document.

Automated compatibility evidence: `npm run test -w @todo/todo-service -- event-evolution.compatibility.test.ts`. The test imports Account Service's real v2 producer factory and validates its output with Todo Service's separately maintained consumer schema. It also verifies concurrent v1/v2 acceptance, unknown-field handling, and stable v1 field meanings.

## Email catalogue

| Email | Trigger | Recipient and contents | Destination |
|---|---|---|---|
| Password reset | `account.password-reset-requested` | Current account address only when it still matches the event; one-time reset token and expiry, never a password or access token. | Sink by default; external SMTP only when the operator has enabled external mode. |
| TODO shared | `todo.shared` | Recipient's current registered address; TODO ID and `state-update` permission, no owner identity. | Sink by default; external SMTP only when the operator has enabled external mode. |
| TODO share withdrawn | `todo.share-withdrawn` | Recipient's current registered address; TODO ID. | Sink by default; external SMTP only when the operator has enabled external mode. |

Mailpit is the default SMTP sink. It captures sink-mode messages at
`http://localhost:8025`;
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
DLQ instead of being sent. Every listed email goes to exactly one destination,
never both. The audited PostgreSQL mode defaults to Mailpit (`sink`); an
operator can enable the external SMTP adapter at runtime. On 2026-10-02 the operator reported
receiving a password-reset message through external mode and successfully
confirming its one-time token with HTTP 204; the sink-mode reset flow was also
tested. No recipient address, token, or message content is recorded here.
When an event first reaches delivery, its destination is pinned to the
current shared mode (`sink` by default). Retries and DLQ replay keep that
destination. A later mode change never redirects a sink-pinned event to the
provider or a provider-pinned event to Mailpit; switching external off stops
all further provider sends, and paused external events are eventually put
in the DLQ. The operator reports Brevo Free allows 300 messages per day;
no-card/no-domain signup facts are operator-reported in Stage 6 evidence.

# Workflow transport note

Workspace provisioning does not add a broker event. Its Account, Todo, and Gateway participant
commands are authenticated internal HTTP requests carrying the immutable workflow correlation ID.
Their durable retry source is the Account Service workflow table, rather than a transient HTTP
request or a second message contract. This distinction is intentional and documented here so the
commands are not mistaken for uncatalogued events.

## Contract event: `TaskActionRecorded` (TaskHistory v1)

This event is emitted by `recordTaskAction` in `contracts/onchain/contracts/TaskHistory.sol`.
It is an EVM log, **not** a RabbitMQ message. The Todo Service chain indexer
reads the configured contract logs from its RPC endpoint and projects canonical
events into PostgreSQL; ordinary TODO broker payloads are not sent to the chain.

| Parameter | ABI type | Indexed | Meaning |
|---|---|---|---|
| `taskId` | `bytes16` | yes | Opaque task identifier |
| `workspaceId` | `bytes16` | yes | Opaque workspace identifier |
| `action` | `uint8` (`Action`) | no | `Created = 0`, `Updated = 1`, `Deleted = 2` |
| `timestamp` | `uint64` | no | Timestamp of the containing block, not the original request time |

The local contract test proves the event's four-value shape. A manual Sepolia v1
demonstration on 2026-10-02 used only synthetic opaque IDs, waited for two
confirmations, and read the count and record back. The indexer reads at a
configurable safe head, deduplicates by chain/contract/transaction/log identity,
and rolls back projections above the common ancestor after a detected reorg.
Projection rebuild is documented in `docs/onchain.md`. Existing TODO broker
events contain account IDs, titles, or actor identities and must never be
forwarded to this contract.
