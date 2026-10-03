## Release rollback (OP-9)

Application and worker services use `APP_RELEASE_ID` image tags. Before deploying a release, use
a unique immutable-by-convention tag (for example the Git commit ID) and build the images:

```powershell
$env:APP_RELEASE_ID = (git rev-parse --short HEAD).Trim()
docker compose build
docker compose up -d --no-build
```

Retain both the currently deployed tag and the previous known-good tag locally. To roll back one
stateless service or worker, identify the operator and provide both tags:

```powershell
$env:ROLLBACK_OPERATOR_ID = $env:USERNAME
npm run rollback:release -- --service todo-service --current <current-release-id> --release <previous-release-id>
```

The command refuses unknown services, invalid tags, missing images, or a deployed image that
does not match `--current`. It preserves the existing replica count and verifies the retained
image ID/reference, running state, configured healthcheck, and supported HTTP health endpoint
of every replica. If application or verification fails, it restores and verifies every replica
on the current image; restoration failure is explicitly reported. For workers without a health
endpoint, running state and image identity do not prove useful consumer progress: also run
`npm run ops:progress`. It does not run schema
down-migrations, restore a database, or reverse a mined chain transaction. Releases must preserve
backward compatibility with the current schema and durable messages. `npm run verify:rollback`
uses a separate no-port Compose project to verify retained image switches, all-replica failure
detection, and automatic restoration without changing a live service. Its synthetic images
exercise the command mechanically; they are not evidence that arbitrary historical releases
are compatible with the deployed schema.

# Operations

## Database backup and restore evidence (OP-4)

On 2026-10-03, while application services and database-writing workers were
stopped, custom-format `pg_dump` backups of both PostgreSQL databases were saved
outside the repository under the operator's user-profile backup directory.
SHA-256 hashes were recorded in a local manifest. The database containers
remained running.

| Database | Backup file | Size | SHA-256 | Restore target | Restore time |
|---|---|---:|---|---|---:|
| Account | `account-20261003_083515.dump` | 49,743 bytes | `4EFA59A590503A52835309471AF453EFC4E06FE8FCA73A6FFDD5943352C4E19D` | `account_restore_20261003_084102` | 0.697 seconds |
| Todo | `todo-20261003_083515.dump` | 49,482 bytes | `7434C820B1AE3699626A72113A4D7050C97316B42ED4B0FB4FF559ABF929D3D9` | `todo_restore_20261003_084102` | 0.717 seconds |

Both dumps restored successfully into newly created scratch databases using
`pg_restore --no-owner`; the original databases were not overwritten. Read-only
row-count checks matched:

| Database | Check | Original | Restored |
|---|---|---:|---:|
| Account | migrations | 15 | 15 |
| Account | users | 12 | 12 |
| Account | workspaces | 0 | 0 |
| Account | workspace members | 0 | 0 |
| Account | deletion requests | 0 | 0 |
| Todo | migrations | 20 | 20 |
| Todo | todos | 8 | 8 |
| Todo | shares | 6 | 6 |
| Todo | history | 5 | 5 |
| Todo | chain submissions | 8 | 8 |

On 2026-10-03 the operator subsequently confirmed that the restored application
behavior worked against the scratch databases. The smoke flow used the temporary
Gateway pointed at the restored Account and Todo APIs and covered authentication
and TODO reads. The first attempt had returned `VALIDATION_ERROR` because the
`Read-Host` prompt labels were supplied as prompt text instead of entering values;
its follow-up request had no bearer token and returned `INVALID_ACCESS_TOKEN`.
That failed attempt was corrected before the operator's successful confirmation.
The backup files and manifest remain private because they contain database data;
they are outside source control.

## Operational command quick reference

Run from the repository root. Confirm the Compose project and target first; never
run a restore against the current application database.

```powershell
# Consumer and chain lag (reports unavailable/not-initialized explicitly).
npm run ops:progress

# Rebuild the local chain projection from chain logs.
npm run rebuild:chain-projection

# Inspect a DLQ without exposing payloads; use any one of the three allow-listed queues.
npm run ops:dlq -- inspect --queue todo.notifications.dlq
npm run ops:dlq -- inspect --queue todo.owner-projection.dlq
npm run ops:dlq -- inspect --queue todo.history.dlq

# Preview history replay; dry-run is the default.
$env:REPLAY_FROM = "2026-10-01T00:00:00Z"
$env:REPLAY_TO = "2026-10-02T00:00:00Z"
npm run replay:history -- --from $env:REPLAY_FROM --to $env:REPLAY_TO --target todo-history

# Set an operator ID only for an approved replay of one event.
$env:DLQ_OPERATOR_ID = $env:USERNAME
$env:EVENT_ID = Read-Host "Event UUID"
npm run ops:dlq -- replay --queue todo.history.dlq --event-id $env:EVENT_ID

# Runtime mail flag; external mode requires approved provider setup and operator authorization.
docker compose run --rm --no-deps -T account-service node apps/account-service/scripts/mail-mode.mjs status
docker compose run --rm --no-deps -T -e MAIL_OPERATOR_ID=$env:USERNAME account-service node apps/account-service/scripts/mail-mode.mjs sink
docker compose run --rm --no-deps -T -e MAIL_OPERATOR_ID=$env:USERNAME account-service node apps/account-service/scripts/mail-mode.mjs external

# Release rollback; retain both image tags and identify the operator.
$env:ROLLBACK_OPERATOR_ID = $env:USERNAME
npm run rollback:release -- --service todo-service --current <current-tag> --release <known-good-tag>
```

The angle-bracket values in the rollback example are placeholders and must be
replaced with retained image tags before execution. For owner-projection replay,
see the dedicated dry-run/apply commands below; it writes only to the fixed
owner queue and requires both isolated service database URLs.

### Scratch-only database backup and restore commands

The following PowerShell example stores custom-format dumps outside the repository
and restores into new scratch databases. It does not overwrite the source database.
Use an approved maintenance window and stop application writers before backup.

```powershell
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $env:USERPROFILE "todo-db-backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$accountDump = Join-Path $backupDir "account-$stamp.dump"
$todoDump = Join-Path $backupDir "todo-$stamp.dump"

docker compose exec -T account-postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/account.dump'
docker compose cp account-postgres:/tmp/account.dump $accountDump
docker compose exec -T account-postgres rm -f /tmp/account.dump
docker compose exec -T todo-postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/todo.dump'
docker compose cp todo-postgres:/tmp/todo.dump $todoDump
docker compose exec -T todo-postgres rm -f /tmp/todo.dump
Get-FileHash -Algorithm SHA256 $accountDump, $todoDump

$accountUser = (docker compose exec -T account-postgres sh -c 'printf "%s" "$POSTGRES_USER"').Trim()
$todoUser = (docker compose exec -T todo-postgres sh -c 'printf "%s" "$POSTGRES_USER"').Trim()
$accountRestoreDb = "account_restore_$stamp"
$todoRestoreDb = "todo_restore_$stamp"
docker compose exec -T account-postgres createdb -U $accountUser $accountRestoreDb
docker compose cp $accountDump account-postgres:/tmp/account-restore.dump
docker compose exec -T account-postgres pg_restore --exit-on-error --no-owner -U $accountUser -d $accountRestoreDb /tmp/account-restore.dump
docker compose exec -T account-postgres rm -f /tmp/account-restore.dump
docker compose exec -T todo-postgres createdb -U $todoUser $todoRestoreDb
docker compose cp $todoDump todo-postgres:/tmp/todo-restore.dump
docker compose exec -T todo-postgres pg_restore --exit-on-error --no-owner -U $todoUser -d $todoRestoreDb /tmp/todo-restore.dump
docker compose exec -T todo-postgres rm -f /tmp/todo-restore.dump
```

Validate row counts and run an authenticated API/read smoke test using a temporary
application configuration pointed only at the two restore databases. Keep both
original databases untouched. After the evidence is captured, drop only the named
scratch restore databases and securely retain or remove the private dump files under
the organization's backup policy.

## OP-8 Operator boundary and command inventory

Routine operations must use the application API, a documented service-specific
operator command, or read-only health/logging interfaces. Direct SQL is not a
routine operator interface. Existing commands commonly run through Docker Compose
and therefore require Docker access; that access is broader than a least-privilege
operator role. These Compose commands are administrator wrappers, not credentials to distribute
to ordinary operators. The restricted database roles, automated break-glass exercise, audit
checks, and limitations are described in [operations-access.md](operations-access.md).

| Task | Supported interface today | Data source or effect | Boundary status |
|---|---|---|---|
| Check service/dependency health | `GET /health/dependencies`; `docker compose ps` and service logs | Health checks and process logs; read-only | Available; use `ops:progress` for lag rather than health. |
| Change mail delivery mode | `mail-mode.mjs status`, `sink`, or `external` | Audited Account PostgreSQL mode; changing mode requires an operator ID | Available, but the wrapper requires Docker access. |
| Inspect/replay a DLQ event | `npm run ops:dlq -- inspect|replay --queue <dlq>` | Three supported DLQs and durable replay audit | Available; mutation needs operator ID and event UUID. |
| Rebuild chain projection | `npm run rebuild:chain-projection` | Rebuilds Todo's local projection from configured chain logs | Available when the chain source is configured; not a chain transaction or a production writer control. |
| Verify account erasure | `npm run verify:account-erasure -- <request-id> <user-id> <email>` | Reads Account/Todo state, Redis, broker queues/DLQs, and chain logs | Available in a running stack; arguments and output may contain personal identifiers, so restrict and redact them. |
| Backfill workspace ownership | `backfill-workspaces.mjs` with dry-run by default and explicit `--apply` | Reads Account ownership and updates eligible Todo rows through the service script | Available; apply is a data mutation and requires a reviewed dry-run. |
| Verify workspace concurrency | `verify-workspace-concurrency.mjs` | Runs a real PostgreSQL concurrency proof using the service environment | Available as a verification command, not a general database console. |
| Apply migrations | One-shot `account-migrations` or `todo-migrations` Compose job | Mutates the corresponding PostgreSQL schema | Available; run only the affected job after backup and migration review. |
| Back up or restore a database | Operator-run `pg_dump` / `pg_restore` procedure; OP-4 evidence is recorded above | Reads or replaces database contents, depending on target | Demonstrated for private scratch restores; not yet wrapped in a least-privilege command. Never restore over the live database as routine practice. |
| Deploy a public contract | Hardhat Ignition deployment command in `docs/onchain.md` | Public chain transaction; requires deployment credentials | Manual release operation; not a routine service command. |
| Replay published event ranges | `replay-event.mjs` (history) or `replay-owner-events.mjs` (owner projection) | Source outbox; direct named consumer queue; per-event audit | Dry-run first; half-open ranges capped at 100 published events. |
| Inspect consumer/chain lag | `npm run ops:progress` | Six consumer queues and chain safe-head/checkpoint | Reports unavailable/not-initialized explicitly; no hand-connected console. |
| Toggle non-mail runtime feature flags | No general feature-flag command exists | No shared flag store/interface | Unsupported; mail mode is the only current audited runtime switch. |
| Roll back an application release | `npm run rollback:release -- --service <service> --current <tag> --release <tag>` | Retained release image and current replica topology | No schema down-migrations or chain reversal; rehearse compatible releases first. |

### Break-glass database access

Direct database access is reserved for an incident or approved maintenance task
that cannot be completed through a supported command. Record the incident/change
identifier, approver, operator, target database, exact read/write statements, and
expected effect before access. Take and verify a backup before writes; use a
scoped, time-limited credential; capture redacted output; validate application
health and affected records afterward; then revoke the credential and record
closure. Never edit outbox, delivery, workflow, migration-history, or chain-state
rows manually to force progress. If a safe recovery command does not exist, stop
and escalate rather than improvising a mutation.

The inventory distinguishes routine application operations from administrator deployment and
database recovery. Do not grant Docker access as a substitute for a least-privilege credential.
Run the isolated access verifier in [operations-access.md](operations-access.md) to check both
allowed operations and denied writes, together with the audited, revoked break-glass role.

## OP-5 Incident runbooks
## Consumer and chain progress (OP-6)

Run this command from a Compose environment with Todo PostgreSQL, RabbitMQ Management, and the
configured chain RPC reachable:

```powershell
docker compose run --build --rm --no-deps -T todo-service npm run ops:progress -w @todo/todo-service
```

It reports each configured consumer queue's ready and unacknowledged message counts and active
consumer count. The chain section reports the RPC latest block, confirmation-adjusted safe head,
projection checkpoint, checkpoint time, and block lag. A missing checkpoint is `not-initialized`;
unreachable or invalid dependencies report `unavailable`, not zero lag. The command queries the
broker, Todo database, and chain RPC itself; operators do not connect to those systems manually.
It does not print event payloads, RPC URLs, or credentials. Dependency failures include a
sanitized reason code rather than fabricated zero counters. `npm run ops:progress --
--require-ready` fails unless all six queues are available, drained, and have consumers and
the chain reader is caught up. On 2026-10-03 the operator ran it successfully: all six queues reported zero ready
and unacknowledged messages with two consumers each. The first chain probe failed because no RPC
was listening. After starting a fresh local Hardhat node, the progress command reported RPC
reachable at chain 31337, latest block 0, safe head -1, and `not-initialized` with no checkpoint.
After deploying TaskHistory, mining one local block, and running `npm run rebuild:chain-projection`,
the operator observed latest block 2, safe head/checkpoint block 1, and zero lag. The final
progress output showed all six queues at zero ready/unacknowledged messages with two consumers.

## OP-5 Incident runbooks

### Broker unavailable

**Symptom:** `GET /health/dependencies` reports RabbitMQ unavailable, or worker logs show
connection/reconnect errors. Business writes should remain in their database outboxes.

```powershell
docker compose ps rabbitmq
docker compose logs --since 10m --tail 100 rabbitmq
docker compose up -d --wait rabbitmq
docker compose ps todo-outbox-worker account-outbox-worker todo-owner-consumer account-notification-consumer todo-history-worker
```

Confirm RabbitMQ is healthy and workers return to `Up`; check the dependency health endpoint
again. Do not purge queues. Outbox publishers retry committed rows after the broker returns.

### Chain RPC unavailable

**Symptom:** chain submission logs report RPC timeouts or chain-ID mismatch. TODO API writes
should remain independent of mining. Current default Compose does not start the chain submission
or indexer workers, so public-chain production progress/lag is not observable through the normal
stack; BC-10..BC-14 operator recovery remains incomplete. Do not start a writer or submit test
transactions using production-derived identifiers. Check `CHAIN_ID`, RPC configuration, and the
contract metadata in the private deployment environment. Restore the RPC and confirm chain ID
before enabling a worker. There is not yet a supported operator status/retry command for a stuck
chain submission; do not edit its database row manually.

### Mail provider rejecting or rate-limiting

**Symptom:** a business request succeeds but no mail arrives; consumer logs show a sanitized
notification failure, or delivery reaches the notification DLQ. First check mode and worker state:

```powershell
docker compose run --rm --no-deps -T account-service node apps/account-service/scripts/mail-mode.mjs status
docker compose ps account-notification-consumer
docker compose logs --since 10m --tail 100 account-notification-consumer
```

Check the registered recipient's inbox/spam and provider activity without exposing the address,
message, token, or credential in shared logs. A provider-pinned message is not rerouted to Mailpit
when mode changes. Keep mode at sink to stop new external attempts; do not replay an external-pinned
event until external service is available and recipient quota permits delivery.

### Consumer stopped making progress

**Symptom:** `/health/dependencies` lists a consumer unavailable, or its queue backlog grows.
Check health, replicas, and recent logs:

```powershell
Invoke-RestMethod http://localhost:3000/health/dependencies
docker compose ps todo-owner-consumer account-notification-consumer todo-history-worker
docker compose logs --since 10m --tail 100 todo-owner-consumer account-notification-consumer todo-history-worker
```

Restore the failed dependency first, then recreate/restart only the affected consumer service.
The health endpoint reports liveness, not lag. Run `npm run ops:progress` to inspect ready and
unacknowledged counts, active consumers, and the chain safe-head/checkpoint distance.

### Dead-letter queue filling

**Symptom:** notification or consumer failures are accumulating in a DLQ. Stop the underlying
failure before replay. For a known notification event ID, the supported targeted replay is:

```powershell
$env:EVENT_ID = Read-Host "Notification event UUID"
$env:DLQ_OPERATOR_ID = $env:USERNAME
npm run ops:dlq -- replay --queue todo.notifications.dlq --event-id "$env:EVENT_ID"
```

The script targets one notification event, preserves nonmatching messages, checks terminal
delivery state, and has replay fencing. Do not purge a DLQ or edit delivery records manually.
Use the unified command below for notification, owner-projection, and history DLQs. The
durable-outbox range replay command below is separate from DLQ replay.

### Targeted event replay (OP-3)

The first supported target is `todo-history`. The command selects already-published Todo outbox
events in the half-open UTC range `[from, to)`, validates every selected envelope, and sends them
only to the durable history queue. It is capped at 100 matching events; split larger ranges into
smaller windows. The consumer's unique `todo_history.event_id` constraint makes duplicate delivery
a no-op. The Account-source owner-projection command below has a separate allow-list and
consumer receipt check; this Todo-source command deliberately rejects other targets.

The Todo migration adding `todo_event_replay_audit` must be applied first. Use a UTC ISO-8601
range from a trusted incident record. Dry-run is the default and prints event IDs/types and
already-processed status, but no event payload:

```powershell
$env:REPLAY_FROM = "2026-10-02T00:00:00Z"
$env:REPLAY_TO = "2026-10-03T00:00:00Z"
docker compose run --rm --no-deps -T todo-service node apps/todo-service/scripts/replay-event.mjs --from $env:REPLAY_FROM --to $env:REPLAY_TO --target todo-history
```

Review the dry-run result. To publish, identify the operator and explicitly pass `--apply`:

```powershell
$env:TODO_EVENT_REPLAY_OPERATOR_ID = $env:USERNAME
docker compose run --rm --no-deps -T -e TODO_EVENT_REPLAY_OPERATOR_ID todo-service node apps/todo-service/scripts/replay-event.mjs --from $env:REPLAY_FROM --to $env:REPLAY_TO --target todo-history --apply
```

The command refuses unsupported targets, invalid/reversed ranges, oversized ranges, and any
selected row with a mismatched envelope. Already-processed events are audited as no-ops. Apply
attempts are recorded per event in `todo_event_replay_audit`; on a publish error it stops at that
event and reports the confirmed prefix. An uncertain broker confirmation is not proof that
publication failed, so inspect the audit row and history before retrying. The earlier single-ID
attempt failed UUID validation before publishing; it did not change consumer state. Do not edit
outbox or history rows manually. This command does not inspect or replay any RabbitMQ DLQ.

#### Account owner-projection replay (OP-3)

The separate Account outbox replay supports only published `account.registered` and
`account.email-changed` events. It accepts one `--event-id` or a strict UTC ISO half-open
`--from`/`--to` range, capped at 100 events. It validates each envelope against the owner
consumer's event shapes and queries Todo's `processed_events` receipt and deletion tombstone
before replay. Dry-run is the default and prints counts only; it does not print event IDs,
payloads, emails, or owner IDs.

Apply Account migration `016_create_owner_event_replay_audit.cjs` first
(`npm run migrate:account`), then set `ACCOUNT_DATABASE_URL` and `TODO_DATABASE_URL` to the
isolated database credentials. A read-only preview does not connect to RabbitMQ:

```powershell
$env:REPLAY_EVENT_ID = "<published-account-event-uuid>"
node apps/account-service/scripts/replay-owner-events.mjs --event-id $env:REPLAY_EVENT_ID
```

After reviewing the counts, an operator may explicitly apply:

```powershell
$env:TODO_EVENT_REPLAY_OPERATOR_ID = $env:USERNAME
# Set RABBITMQ_URL to the isolated broker before applying.
node apps/account-service/scripts/replay-owner-events.mjs --event-id $env:REPLAY_EVENT_ID --apply
```

Apply sends to the dedicated `todo.owner-projection` queue (not the exchange), uses publisher
confirms, and resets the owner retry-count header to zero. Every selected event is audited in
Account's `owner_event_replay_audit` as started, queued, already processed, or failed. A failed publish
after a send attempt is marked `replay_outcome_uncertain`; reconcile the audit and consumer receipt
before retrying. A deletion tombstone is never replayed; it is audited as failed with
`account_deleted_tombstone`. Stop on errors and do not publish against live services as a rehearsal.

The exported `runOwnerReplayRehearsal` helper is used by
`node scripts/verify-operations.mjs`: pass it the isolated Account/Todo database pools, a
RabbitMQ confirm channel, a published unprocessed event UUID, and an operator ID. It sends once,
waits for the `todo-owner-projection` row in `processed_events`, then invokes the replay again and
requires both `queued` and `already_processed` audit evidence in Account's
`owner_event_replay_audit` without a second send. The verifier
also seeds an isolated deletion tombstone and confirms the event is not queued or receipted and is
audited as `account_deleted_tombstone`. Its output contains counts only. The rehearsal requires the
owner consumer to be running and must use isolated databases and broker resources.

The earlier operator-reported notification replay proved that path only. The subsequent
committed clean-clone operational rehearsal at `5515a4c` passed real inspection/replay for
all three configured DLQs and actual owner-consumer idempotency/audit, as recorded in
[operator-verification.md](operator-verification.md). It does not cover arbitrary other queues.

The unified allow-listed command is available for all three configured service DLQs:
`todo.notifications.dlq`, `todo.owner-projection.dlq`, and `todo.history.dlq`. It emits only
event ID, event type, occurrence time, and a sanitized failure reason; event payloads are never
printed. Inspection preserves messages, but temporarily holds and requeues them; ordering may
change, so do not assume a stable FIFO order while inspecting. Replay requires an event ID and operator identity, scans at most
1,000 messages, publishes to the paired consumer queue with publisher confirms, then removes the
matching DLQ copy. Notification replay also resets the durable delivery claim through its existing
repository. Account migration `015_create_dlq_operation_audit.cjs` records each replay before
mutation and records `queued`, `already_processed`, `failed`, or `outcome_uncertain`. A crash may
leave `started`; reconcile that event against consumer receipts before retrying. Broker confirms
and database writes are not one distributed transaction. The original DLQ copy is retained on
failure, and consumer event-ID deduplication handles duplicate deliveries.

```powershell
npm run ops:dlq -- inspect --queue todo.history.dlq
$env:DLQ_OPERATOR_ID = $env:USERNAME
npm run ops:dlq -- replay --queue todo.history.dlq --event-id $env:EVENT_ID
```

Use the same command with `todo.owner-projection.dlq` or `todo.notifications.dlq` as the queue.
For every replay, set `DLQ_OPERATOR_ID` in the host environment and pass it into the one-shot
container with `-e DLQ_OPERATOR_ID` (the root npm wrapper does this). Verify the replay result and consumer-owned state before
retrying after an uncertain confirmation.

`npm run verify:day4` invokes `verify:operations` only on its disposable project. The rehearsal
checks redacted inspection, all three dedicated replay queues, publisher confirmation and audit,
retry-header reset, preservation of unrelated DLQ messages, half-open history range boundaries,
dry-run nonpublication, and duplicate history/notification delivery claims. It never sends
external mail or stops consumers in the normal operator stack.
The completed clean-clone rehearsal also stopped/restarted its isolated broker,
proved durable API registration/outbox delivery and an actual owner-consumer receipt,
and finished with all six consumer queues drained and zero chain lag.

### Transaction appears stuck

**Symptom:** a chain submission remains nonterminal or an operator reports a transaction hash
that has not progressed. Save the public transaction hash, chain ID, and contract address; never
share a private key or RPC URL. Check the public testnet explorer and RPC availability. A transaction
already mined on chain cannot be rolled back. Default Compose now runs two `chain-writer`
and two `chain-indexer` instances. The writer stores the nonce, public transaction fields and
deterministic transaction hash before broadcasting. Restarting it reconciles that hash and can
rebroadcast the identical transaction, rather than writing a second record.

```powershell
docker compose logs --tail 100 chain-writer chain-indexer
docker compose restart chain-writer
```

Five failed attempts place the row in `dead_letter`; it is a durable human-review queue,
not a RabbitMQ queue. Rows with a known hash continue receipt reconciliation without further
broadcast attempts. A mined success becomes `confirmed` only at `CHAIN_CONFIRMATIONS` (minimum
two); a mined revert becomes `abandoned`. Automatic fee replacement and an audited chain-DLQ
replay command are not built. Do not change a reserved nonce or manually replay an uncertain
submission: first reconcile its public hash and nonce on the configured chain. BC-11's
unconditional terminal-state guarantee for indefinitely dropped/stuck transactions and OP-5's
complete recovery tooling remain uncovered.

### Chain runtime and contract replacement

Put the signing key in `writer.key` in an untracked local directory and set `CHAIN_SECRET_DIR`
to that directory. Compose mounts it read-only into writers; it is not baked into an image or
passed as an environment value. Set the public `CHAIN_WRITER_ADDRESS` to the derived address,
and set RPC, chain ID, current contract and deployment block from the contract build/deployment.
Then run `docker compose up -d --build chain-writer chain-indexer`. A missing file or mismatched
address fails startup explicitly. Never paste the key into a command, document, log or ticket.

Before replacing a contract, retain its address and original deployment block in
`CHAIN_PREVIOUS_CONTRACTS`, for example `[{"address":"<previous-public-address>","deploymentBlock":1}]`.
Both current and retained contracts are indexed separately; queries through the projection
repository include all addresses. Retained contracts remain directly readable on chain.
Only ABI-compatible `TaskHistory` replacements are supported; a changed ABI needs a versioned
decoder, not a pasted address.

For an exclusive rebuild, run the normal command while APIs and indexer replicas stay up:

```powershell
npm run rebuild:chain-projection
```

Indexers hold the advisory lock for one polling cycle, releasing it between cycles. Rebuild
waits up to 30 seconds to acquire that same lock and never races a scanner. Both replicas stay
running, waiting if rebuild or the other replica owns the lock. If a long scan prevents acquisition
for the full budget, rebuild fails explicitly and can be retried; it does not silently skip work.

Personal tasks deliberately use `00000000-0000-4000-8000-000000000001` as a shared **non-tenant
sentinel** on chain. It is not a real workspace, membership authority, or per-person identifier.
The off-chain `workspace_id` remains null and authorization remains owner-based. Creating a
personal on-chain workspace per user would create a permanent person-level correlation key.
The sentinel groups all personal tasks together and intentionally loses personal-workspace
grouping; task identifiers remain random opaque IDs. Never derive this value from an owner ID,
email, title, or their hashes.

### Migration failed

**Symptom:** `account-migrations` or `todo-migrations` exits nonzero. Capture the named migration
and error, and stop dependent service startup. Inspect only the migration logs:

```powershell
docker compose logs --no-color --tail 100 account-migrations todo-migrations
```

Take/retain a database backup before any repair. Resolve the migration/code/history mismatch, then
then rerun only the failed job after confirming its target database and migration history:

```powershell
docker compose run --rm account-migrations
docker compose run --rm todo-migrations
```

Run only the affected service's job. Do not use `--no-check-order`, edit `pgmigrations`, or run
`down` against production data as a shortcut. These commands use the configured Compose database;
they are not a substitute for a backup or a reviewed recovery plan.

### Workflow stuck unwinding

**Symptom:** workspace provisioning remains compensating or reports a compensation failure.
Check the internal workflow health endpoint from Account Service:

```powershell
docker compose exec -T account-service node --input-type=module -e "const r=await fetch('http://127.0.0.1:3001/health/workflows'); console.log(r.status, await r.text());"
docker compose logs --since 10m --tail 100 workflow-worker
```

Restore the unavailable participant and let the leased worker resume. Do not create/delete
reservation rows manually. The workflow status endpoint is documented in `docs/api.md`; the
health response exposes stuck-compensation count and threshold without a database connection.

### Latency objective breached

**Symptom:** users report slow reads/writes or timeouts. Check dependency health and service logs:

```powershell
Invoke-RestMethod http://localhost:3000/health/dependencies
docker compose ps
docker compose logs --since 10m --tail 100 gateway account-service todo-service
```

The declared PF-4 objectives are read p95 <= 300 ms and write p95 <= 500 ms. The
`npm run verify:performance` gate measures these in an isolated synthetic-load run;
it is not a live production monitor and must not be used to diagnose a live incident.
For an incident, record the affected endpoint, UTC window, concurrency and measured
latency from approved telemetry, then compare those measurements with the documented
objectives. Do not run the synthetic load against production.

## Notification delivery (Stages 2 and 3)

### Local mail outage runbook (Stage 5)

Symptom: a password-reset or TODO-sharing request succeeded but no message is
visible in Mailpit. Check worker progress and the notification DLQ, then run
the isolated regression proof:

```powershell
npm run verify:mail
```

It runs mail unit tests, builds its own sink-only Compose project with two
Account Service and notification-consumer replicas, stops Mailpit while a
real Gateway reset request succeeds, checks two retries and a DLQ event,
confirms an authenticated TODO read/write still succeed, restarts Mailpit,
replays the event and checks Mailpit. It cleans only its
disposable project. A passing result prints `Mail verification passed`;
it never sends to an external provider. Do not run this against real accounts:
the verifier generates and removes its own local test account and volumes.
It configures inert local-only chain addresses so Todo can start; it does not
start a chain writer or submit a chain transaction.
The verification project uses 3/4-second retry delays; normal deployments
retain 30/60-second defaults. When the actual operator DLQ is filling,
restore Mailpit, inspect the affected event IDs, and replay them individually
using the command below; do not purge the queue or edit delivery rows.

### Runtime destination control (Stage 4)

Mailpit is the default. The mail mode lives in Account PostgreSQL; both
notification workers read it for each event. Run these from a Compose stack
as an operator with Docker access. The on/off commands require an operator
identifier for the 30-day audit trail; the status command does not.

```powershell
docker compose run --build --rm --no-deps -T account-service node apps/account-service/scripts/mail-mode.mjs status
docker compose run --rm --no-deps -T -e MAIL_OPERATOR_ID=$env:USERNAME account-service node apps/account-service/scripts/mail-mode.mjs sink
docker compose run --rm --no-deps -T -e MAIL_OPERATOR_ID=$env:USERNAME account-service node apps/account-service/scripts/mail-mode.mjs external
```

Each command prints `configuredMode` and `effectiveMode`; confirm both are
`sink` after switching off. Only operators with Docker/database access can
change mode; no public or internal HTTP route performs the switch. Changes
are recorded in `notification_mail_mode_audit` without credentials and cleaned
up after `NOTIFICATION_RETENTION_SECONDS` (30 days by default).

For external mode, first qualify a free provider and a sender you control.
Set `MAIL_PROVIDER_HOST`, `MAIL_PROVIDER_PORT` (587 by default), and
`MAIL_PROVIDER_FROM` in local deployment configuration. Supply a local JSON
file named `smtp.json` in `MAIL_SECRET_DIR` (default `./secrets/mail`) with
`username` and `password` string fields; keep the file readable only by the
container user and never commit it. The directory is ignored by Git and Docker
build context; authenticated SMTP on port 587 requires TLS. It is
mounted read-only as `/run/todo-mail-secrets`. Do not put credential values
in environment variables, commands, logs, events or database rows. Startup
in sink mode requires no file. The worker defaults to
`MAIL_TEST_SINK_ONLY=true`; only in an explicitly prepared real-mail deployment
set it to `false` before starting workers. After preparation, the commands
above change mode without redeploying either worker. External mode refuses
to turn on if any setting or the credential file is missing or malformed.
Keep the configured mode on `sink` throughout any rollout containing an old
notification-worker image: old workers do not read the shared mode or event
pin, and would otherwise send a provider-bound event to Mailpit. Switch to
external only after both notification replicas run the new worker code.

Sink-pinned messages remain in Mailpit after external mode is enabled. A
provider-pinned message is **not** silently rerouted to Mailpit when external
mode is disabled: it is set aside after bounded retries. Inspect/replay only
after re-enabling external mode, or leave it in the DLQ for an operator.
Do not run the live mode verifier with provider-enabled workers:

```powershell
docker compose run --build --rm --no-deps -T account-service node apps/account-service/scripts/verify-mail-mode.mjs
```

This proof insists on `MAIL_TEST_SINK_ONLY=true`, checks two readers, pinning,
audit and the kill switch, and returns the configured mode to sink without
sending a message. It does not demonstrate a real inbox delivery (ML-1).

### Manual free-provider qualification and inbox proof (Stage 6)

This is deliberately an operator-run procedure; no automated test or
`verify:day4` command sends external mail. Do not start until the sink-only
gates pass: `npm run verify:mail`, the mail unit tests, the live `verify-mail-mode.mjs`
and `verify-notification-quota.mjs` checks. The last check uses the deployed
Account PostgreSQL schema, so stop if it reports a migration/schema mismatch.

The operator reports that on 2026-10-02 a password-reset message reached a
registered, operator-controlled inbox through Brevo external mode, and the
one-time token was accepted by the confirmation endpoint (HTTP 204). The
operator also exercised the reset flow in sink mode. The operator reports
Brevo Free allows 300 messages per day and signup required only a personal
email, without a card or company domain. The operator also reports replacing
the SMTP key used during setup. This is manual evidence; retain a redacted
provider receipt outside the repository without an address, token, message
content, or credential. The sender address remains intentionally omitted from
tracked documentation and environment examples.

Use only a registered recipient account whose inbox the operator controls, and
an existing unshared TODO owned by an operator-controlled account. The public
share operation resolves the supplied email to an account; the notification
worker independently checks that account and its current address before send.
It sends a TODO-share notice, not a password-reset message, so no reset token is
involved. The message contains the TODO ID; use a disposable test TODO and do
not put personal data in its title or description.

1. Configure these non-secret values in the local Compose environment. The
   sender value is operator-reported as verified; retain the sink-only guard
   until ready for the manual test:

	```dotenv
	MAIL_PROVIDER_HOST=smtp-relay.brevo.com
	MAIL_PROVIDER_PORT=587
	MAIL_PROVIDER_FROM=
	MAIL_TEST_SINK_ONLY=true
	MAIL_SECRET_DIR=./secrets/mail
	```

	Put SMTP `username`
	and `password` in `./secrets/mail/smtp.json` (or the configured
	`MAIL_SECRET_DIR`) using a local secret manager or secure editor. Do not put
	credentials in `.env`, command arguments, shell history, logs, screenshots,
	or repository files. The mounted file is read-only inside the containers.
2. Set `MAIL_TEST_SINK_ONLY=false` in the local Compose environment and
	recreate only the notification consumers so both replicas load that
	explicit live-send permission:

	```powershell
	docker compose up -d --build --force-recreate account-notification-consumer
	docker compose ps account-notification-consumer
	```

	Confirm two healthy consumer replicas. Do not use `docker compose config`,
	`docker inspect`, or environment-dumping commands because they may disclose
	configuration. Keep the shared mode at sink until the following checks.
3. Read the mode, then enable external delivery with the audited operator
	command. Enabling first opens and authenticates an SMTP connection with a
	bounded timeout; it sends no message and sanitizes provider errors. These
	commands print only the configured/effective mode:

	```powershell
	$env:MAIL_OPERATOR_ID = $env:USERNAME
	docker compose run --rm --no-deps -T account-service node apps/account-service/scripts/mail-mode.mjs status
	docker compose run --rm --no-deps -T -e MAIL_OPERATOR_ID=$env:MAIL_OPERATOR_ID account-service node apps/account-service/scripts/mail-mode.mjs external
	docker compose run --rm --no-deps -T account-service node apps/account-service/scripts/mail-mode.mjs status
	```

	Continue only if the final read-back is `configuredMode=external` and
	`effectiveMode=external`. If SMTP verification fails, the command does not
	change the shared mode; stop and keep the system in sink mode. Do not print
	the secret file or provider environment to diagnose it. A successful SMTP
	verification proves connectivity/authentication only; it does not prove
	sender approval, provider free-tier terms, or inbox delivery.

The operator's reported completed trial used the password-reset flow; the
one-time token was submitted privately and the confirmation endpoint returned
HTTP 204. Do not repeat the request just to create another test email. If a
future operator has no external receipt yet, trigger exactly one normal share
notification as below.

4. Trigger exactly one normal share notification. Enter values interactively
	rather than putting them literally in a command. Do not run PowerShell
	transcription or terminal/session recording during this step. The owner
	token and inbox address remain in process memory only; the response output
	is restricted to non-address identifiers:

	```powershell
	$ownerTokenSecure = Read-Host "TODO owner access token" -AsSecureString
	$ownerToken = [System.Net.NetworkCredential]::new("", $ownerTokenSecure).Password
	$todoId = Read-Host "ID of an existing unshared test TODO"
	$recipientEmail = Read-Host "Registered operator-controlled inbox address"
	$body = @{ recipientEmail = $recipientEmail } | ConvertTo-Json -Compress
	$share = Invoke-RestMethod -Method Post `
	  -Uri "http://localhost:3000/api/v1/todos/$todoId/shares" `
	  -Headers @{ Authorization = "Bearer $ownerToken" } `
	  -ContentType "application/json" -Body $body
	$share | Select-Object id, todoId, recipientId, permission, sharedAt
	Remove-Variable ownerTokenSecure, ownerToken, recipientEmail, body
	```

	Do not retry the request if its result is uncertain: first check the share
	state and inbox, because a retry can create another notification after
	cleanup. The per-address limit is five distinct notification events per
	rolling 24 hours; retries of the same event reuse its reservation.
5. Confirm the message in the controlled inbox and the provider's delivery
	activity. Save evidence outside the repository, or record only provider,
	UTC time, delivery outcome, and a redacted receipt reference. Redact the
	recipient address and any message content from screenshots. Never capture a
	bearer token, SMTP credential, full provider response, or reset token. The
	application logs should contain neither recipient address nor credentials;
	do not use raw broker payloads or database rows as evidence.
6. Immediately disable external delivery and read it back. Then restore the
	sink-only guard and recreate the two consumers:

	```powershell
	docker compose run --rm --no-deps -T -e MAIL_OPERATOR_ID=$env:MAIL_OPERATOR_ID account-service node apps/account-service/scripts/mail-mode.mjs sink
	docker compose run --rm --no-deps -T account-service node apps/account-service/scripts/mail-mode.mjs status
	```

	Confirm both values are `sink`. Set `MAIL_TEST_SINK_ONLY=true` in the local
	Compose environment, then run:

	```powershell
	docker compose up -d --build --force-recreate account-notification-consumer
	docker compose ps account-notification-consumer
	docker compose run --rm --no-deps -T account-service node apps/account-service/scripts/mail-mode.mjs status
	```

	Confirm two healthy replicas and `configuredMode=sink`,
	`effectiveMode=sink`. Revoke or rotate the temporary provider credential
	after the demonstration, and remove the local secret file when no longer
	needed. Record ML-1 and ML-2 as proven only after the inbox receipt and
	provider terms have both been witnessed; this procedure alone is not proof.

### Recipient quota and live verification (Stage 3)

Mail only goes to the current address of a registered, non-deleting account.
An address has five distinct notification events in any rolling 24 hours;
retries for the same event reuse their slot. Over-quota notifications go to
the DLQ for inspection instead of sending. `MAIL_QUOTA_RETENTION_SECONDS`
defaults to 86,400; hourly cleanup removes expired reservation rows in
bounded batches, and account deletion cascades them immediately. A delivery
holds the account recipient lock until the send returns; deletion requests
and email changes wait for that lock before committing.

With the PostgreSQL stack migrated, run the sink-only verifier:

```powershell
docker compose run --build --rm --no-deps -T account-service node apps/account-service/scripts/verify-notification-quota.mjs
```

It creates and removes one test-only account, proves two workers share the
same limit, that retries do not count again, and that a pending deletion
prevents future sends. It neither starts a mail worker nor contacts a provider.
On 2026-10-02 the deployed migration history was reconciled with the tracked
Account and Todo migration files. Both normal migration runs completed:

```powershell
docker compose run --rm --build account-migrations
docker compose run --rm --build todo-migrations
```

Use normal ordered migrations; do not bypass order checks or selectively skip
the deletion-workflow upgrade. The account deletion migration refuses to run
if legacy deletion requests exist, requiring an explicit state-preserving plan.
The deployed account-erasure verifier still needs to be rerun against the
reconciled schema before claiming full DG-10.

### Retry and DLQ replay (Stage 2)

The Account notification worker uses two delayed retries (30 and 60 seconds),
then sets aside a message after the third failed send. The triggering API
operation does not wait for mail. Invalid events go to the notification DLQ
immediately. The local Mailpit sink remains the only configured transport.

With the Compose stack running, verify retry state, real PostgreSQL competing
claims, RabbitMQ TTL routing, and isolated replay without sending mail:

```powershell
docker compose run --build --rm --no-deps -T account-service node apps/account-service/scripts/verify-notification-retry.mjs
```

The verifier creates unique delivery rows and private RabbitMQ queues, then removes
them. It passes when it prints `Notification retry concurrency, lease recovery,
terminal fencing, and replay verified`. Do not run it against an external mail
provider; it creates no notification consumer or real recipient.

For one known notification event already in `todo.notifications.dlq`, set
`$env:EVENT_ID` to its event UUID and run:

```powershell
$env:DLQ_OPERATOR_ID = $env:USERNAME
npm run ops:dlq -- replay --queue todo.notifications.dlq --event-id "$env:EVENT_ID"
```

The legacy `replay-notification-dlq.mjs <event-id>` delegates to the same audited CLI
and also requires `DLQ_OPERATOR_ID`; it is not an unaudited bypass.
This scans at most 1,000 messages, holding nonmatching entries unacknowledged until
the scan finishes and then returning them to the DLQ. Only a terminal delivery
can be reset for replay; an already sent event is acknowledged without resending.
Replay requires its delivery row to remain available (notification delivery
retention defaults to 30 days). An absent row causes the command to fail without
acknowledging the DLQ copy.
The command republishes the selected event to the main notification queue,
confirms it reached RabbitMQ, then acknowledges the DLQ copy. The worker checks
the current account before every send, so an erased recipient is skipped. If
publication fails, the DLQ copy is returned. An uncertain publish leaves a
five-minute replay lease; after it expires, repeating the command takes over
the lease. Two operators running the command at once cannot both hold it.
A crash after confirmation but before acknowledging may leave duplicate broker
copies; the event-ID claim fences concurrent sends, but SMTP acceptance followed
by a process crash can still produce a second mail after the lease expires.

## Account lifecycle controls (DG-1 through DG-10)

### Export

Use `GET /api/v1/users/me/export` with a valid bearer token. The response is assembled from both
data owners and excludes passwords, token values, JWTs, and service secrets. A non-2xx response
is not a partial export.

### Deletion and verification

Deletion is asynchronous and requires an `Idempotency-Key`:

```powershell
curl.exe -X DELETE http://localhost:3000/api/v1/users/me -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY"
```

After completion, run:

```powershell
npm run verify:account-lifecycle
docker compose exec -T todo-service node apps/todo-service/scripts/verify-account-erasure.mjs <deletion-request-id> <user-id> <email>
```

The verifier covers both databases, Redis, all configured queues/DLQs, and chain logs. A failed
check means the account is not fully erased. Restore the unavailable dependency and let the
leased worker retry; do not delete rows manually. Repeating the same idempotency key is safe.

Personal unshared TODOs and account-linked queue messages are removed. Shared workspaces and
shared TODOs remain for other members, with retained history anonymized. Public chain history is
immutable and opaque; only local pending/projection references for deleted personal TODOs are
removed.

### Retention cleanup

The replicated `account-cleanup-worker` runs bounded transactional batches. Configure lifetimes:

| Data | Setting | Default |
|---|---|---:|
| Expired/revoked sessions | `SESSION_RETENTION_SECONDS` | 2,592,000 (30 days) |
| Used/expired refresh and reset tokens | `TOKEN_RETENTION_SECONDS` | 2,592,000 (30 days) |
| Published account outbox events | `OUTBOX_RETENTION_SECONDS` | 2,592,000 (30 days) |
| Completed notification deliveries | `NOTIFICATION_RETENTION_SECONDS` | 2,592,000 (30 days) |
| Per-address mail reservations | `MAIL_QUOTA_RETENTION_SECONDS` | 86,400 (24 hours; removed by the next hourly cleanup) |
| Mail-mode change audit | `NOTIFICATION_RETENTION_SECONDS` | 2,592,000 (30 days) |

Cleanup never removes active sessions, unused refresh tokens, in-flight notification
retries/terminal handoffs/replays, or unpublished outbox events.

## Workspace-launch Activity 2/3 manual verification

```bash
docker compose up -d --build --scale workspace-launch-worker=2
docker compose ps workspace-launch-worker
```

Trigger `POST /api/v1/workflows/workspace-launch` as documented in `docs/api.md`. Before completion,
direct normal workspace/Todo reads must return the same not-found response as a missing resource.
After the membership projection arrives, both become visible together.

To verify process resume, stop both workers after a step log, wait longer than
`WORKFLOW_LEASE_MS`, and restart them:

```bash
docker compose stop workspace-launch-worker
sleep 31
docker compose start workspace-launch-worker
docker compose logs workspace-launch-worker | grep '<workflow-id>'
```

Expected: previously applied steps are not applied again; an `applying` step may be safely retried;
the same workflow reaches completion without a second client trigger.

The same scenario is automated by `npm run test:workflow-resume`: it starts the stack, pauses Todo
Service to hold the workflow during its second step, sends `SIGKILL` to both workers, unpauses Todo,
waits for lease expiry, restarts two workers, and fails unless the original workflow becomes an
accessible workspace and its correlation can be found in worker logs. It is safe for a clean clone
and uses a unique test account and idempotency key on every run.

## Rebuilding Projections (OP-1, BC-6)

### 1. Chain Projection Rebuild (BC-6, OP-1)
Rebuilds the local relational copy of what is on chain (`task_chain_events`, `chain_projection_blocks`,
and `chain_projection_checkpoints`) from the configured contract on the blockchain.

```powershell
npm run rebuild:chain-projection
```
* **What it does:** Clears existing projection tables for `(CHAIN_ID, TASK_HISTORY_CONTRACT_ADDRESS)` and scans all canonical event logs starting from `TASK_HISTORY_DEPLOYMENT_BLOCK` up to the current confirmed safe head (`latestBlock - CHAIN_CONFIRMATIONS + 1`).
* **Safety:** Atomic database operations within transactions. Safe to execute while the application is live. Does not touch or mutate on-chain state or tasks table.
* **Verification:** Produces structured log output: `Cleared local chain projection; rebuilding from deployment block` followed by `Chain projection rebuild completed`.

### 2. Workspace Backfill Rebuild (TN-11, OP-1)
Rebuilds or backfills workspace membership onto unassociated TODO items.
```powershell
docker compose exec -T todo-service node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key "$INTERNAL_SERVICE_SECRET" --apply
```
