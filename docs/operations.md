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
