# Operations

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
On the current running database, the historical 011 deletion migration has a
different schema from this checkout. The isolated 012 quota and 013 transport
migrations were applied; the full deletion endpoint and account-erasure verifier still
need a separate schema migration and live proof. Do not treat this verifier
as evidence that the deployed deletion workflow works.

On a clean database, `npm run migrate:account` applies the normal file-based
migrations. For the existing database with the conflicting historical 011
record, each command below was first dry-run with `--dry-run`, then used to
apply only its named migration without faking or editing any previous row:

```powershell
docker compose run --build --rm --no-deps -T account-migrations npm run migrate -- --no-check-order --use-glob -m "migrations/012_create_notification_address_reservations.cjs" --no-verbose
docker compose run --build --rm --no-deps -T account-migrations npm run migrate -- --no-check-order --use-glob -m "migrations/013_add_notification_transport_controls.cjs" --no-verbose
```

Do not use the single-file option to skip the legacy deletion-schema repair
when deploying the account-deletion workflow itself.

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
docker compose run --build --rm --no-deps -T account-service node apps/account-service/scripts/replay-notification-dlq.mjs "$env:EVENT_ID"
```

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
