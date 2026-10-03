# Operator command verification

## Preconditions and safety

Use Node.js 24 or later, Docker with Linux containers, and Docker Compose 2.24.4 or
later. Run commands from the repository root. A normal deployed stack needs its own
local configuration; the isolated Day 4 verifier generates test-only configuration
and does not use a developer's `.env`, mail credentials, public RPC, or live volumes.

An event ID is a UUID, not a mail address, token, or broker payload. Do not put
secrets or personal data into operator identity fields. Replay only after fixing
the original failure and reviewing the dry-run. Retain current and previous
compatible release images before rollback.

## Routine commands

```powershell
# Read-only views (DLQ inspection temporarily holds/requeues messages).
npm run ops:progress
npm run ops:dlq -- inspect --queue todo.notifications.dlq
npm run ops:dlq -- inspect --queue todo.owner-projection.dlq
npm run ops:dlq -- inspect --queue todo.history.dlq

# Reprocess exactly one selected DLQ event.
$env:DLQ_OPERATOR_ID = $env:USERNAME
$env:EVENT_ID = Read-Host "Event UUID"
npm run ops:dlq -- replay --queue todo.history.dlq --event-id $env:EVENT_ID

# Preview history replay. Both times require an explicit ISO-8601 timezone.
$from = "2026-10-01T00:00:00.000Z"
$to = "2026-10-02T00:00:00.000Z"
npm run replay:history -- --from $from --to $to --target todo-history

# Apply only after reviewing the preview.
$env:TODO_EVENT_REPLAY_OPERATOR_ID = $env:USERNAME
npm run replay:history -- --from $from --to $to --target todo-history --apply
```

Owner replay reads the Account outbox and checks Todo consumer receipts and deletion
tombstones. See [operations.md](operations.md) for its service-specific credentials,
fixed target, canonical UTC time format, and audit location. It never republishes to
the shared exchange. Neither replay command recreates expired outbox data; use a
reviewed source recovery if retention has already removed the selected events.

The Compose wrappers above require administrator Docker access. Do not grant that
access to routine operators as a substitute for a restricted operational identity.
See [operations-access.md](operations-access.md) for the enforced database boundary
and deployment responsibilities.

## Automated proof inventory

| Surface | Check | Required result |
| --- | --- | --- |
| Argument validation, queue allow-list, redaction, publisher failure, audit-before-ack | `npm run test:operations` | Every assertion passes; no credentials or payload printed |
| Notification publisher/consumer replay race | Account `notification.replay-handoff.test.ts` | Early claim is accepted; publisher cannot overwrite consumed state |
| History argument/range validation | Todo `todo-history.replay.test.ts` | Invalid, locale-dependent, reversed and future timestamps rejected |
| Three live DLQs and targeted history range | `verify:operations`, invoked by `verify:day4` | Inspect preserves messages; replay changes only one target; retry headers reset; audit and idempotency pass |
| Owner targeted replay | `runOwnerReplayRehearsal` on the disposable stack | Actual consumer records receipt; repeated replay queues nothing and is audited |
| Consumer and chain progress | `ops:progress -- --require-ready` on the disposable stack | Six queues available/drained with consumers; initialized chain checkpoint caught up |
| Runtime mail switch | `verify-mail-mode.mjs` on a sink-only stack | Audited mode changes, pinning, and kill switch pass without external mail |
| Restricted access and break-glass | `verify-operator-access.mjs` on separate scratch databases | Allowed operations succeed, direct writes fail, open/close audit is immutable |
| Retained-image rollback | `npm run verify:rollback` | All replicas switch image references; failed health restores current replicas |

Database restores, public-contract deployment, real SMTP delivery, account-erasure
operations on real identities, and incident-specific break-glass writes are not
safe generic automated commands. Their documented procedures require the named
inputs, approval, and deployment credentials. A clean-source verifier does not
claim to execute those actions against production or a public testnet.
