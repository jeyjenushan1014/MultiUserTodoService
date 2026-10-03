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
| Real local SMTP outage | `node scripts\verify-mail-live.mjs`, also invoked by full `verify:day4` | Request and unrelated Todo traffic survive outage; retries, terminal DLQ, audited replay and Mailpit delivery pass |
| Restricted access and break-glass | `verify-operator-access.mjs` on separate scratch databases | Allowed operations succeed, direct writes fail, open/close audit is immutable |
| Account/Todo backup and restore | `verify:day4 -- --operations-only` | `pg_dump`, scratch `createdb`, `pg_restore --exit-on-error`, nonempty row-count comparison and scratch `dropdb` pass |
| Broker outage/recovery | Disposable `verify:operations` rehearsal | Gateway registration succeeds with broker stopped, durable outbox remains unpublished, then publish and actual owner receipt succeed after restart |
| Retained-image rollback | `npm run verify:rollback` | All replicas switch image references; failed health restores current replicas |

Restores into live databases, public-contract deployment, real SMTP delivery, account-erasure
operations on real identities, and incident-specific break-glass writes are not
safe generic automated commands. Their documented procedures require the named
inputs, approval, and deployment credentials. A clean-source verifier does not
claim to execute those actions against production or a public testnet.

For coordinated source work, run
`npm run verify:day4 -- --working-tree --operations-only`. After committing the
tested source, run `npm run verify:day4 -- --clean-clone --operations-only`.
The former never counts as committed-clean-clone evidence. The latter covers
the operational inventory above, not the separately excluded full chain fault,
Mailpit outage or historical migration compatibility suites.

### Latest committed-source rehearsal

The latest `npm run verify:day4 -- --clean-clone --operations-only` passed with
exit code 0 at `8c94a0d84a0452a13587afab937328c6dce7d2ae`.
Receipt: `.verification/todo-day4-verify-1791053209069-1d64602767-result.json`.
It passed 44 operations tests, ten owner replay tests, 30 Gateway E2E tests and
every operational inventory row except the separately scoped SMTP outage row.
That SMTP row passed at the same revision inside the full clean-clone command;
the full command later failed Gateway dependency readiness for the Todo outbox
publisher. Neither separate passes nor this operational-only success constitute
a passing aggregate full suite. Both projects were cleaned.

### Earlier completed committed-source rehearsal

On 2026-10-03, `npm run verify:day4 -- --clean-clone --operations-only`
passed with exit code 0 at `5515a4ce9d1547463095ed9adc4d8a6fd57ecf08`.
Receipt: `.verification/todo-day4-verify-1791048283836-6e7b4a89b9-result.json`.
All inventory rows above passed against real isolated services, including
the owner consumer's actual processed-event receipt and per-event audit.
The run included 30 live Gateway E2E tests, two projection rebuilds and progress
before/after broker restart. All six queues were drained with two consumers
each; chain lag was zero. Account/Todo nonempty scratch restores and restricted
logins passed, and rollback switched all three replicas then restored them
after deliberately failed health. Verification resources were cleaned up.

Live local OP-8 provisioning and approved migration-maintenance receipts are
separate persistent evidence in [operations-access.md](operations-access.md).
The earlier decisions/failures are superseded only for these measured surfaces,
not for the wider full-Day-4 or repository-wide command requirements.
