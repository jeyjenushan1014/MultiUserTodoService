# OP-8 Operator Access Boundary

## Routine access

Routine operator work should use the service API, a command dedicated to that
operation, or read-only health/log interfaces. The bounded non-Docker CLI below
provides this interface for Account mail status/sink and audit views, plus Todo
chain checkpoint progress. Routine operator credentials receive no raw database
table or sequence access. RabbitMQ, Redis, and chain-signing credentials are
not part of that interface. Several existing operational commands still run
through Docker Compose and are not yet available to a non-Docker operator; this
boundary does not claim to have replaced those wrappers.

| Routine task | Interface |
| --- | --- |
| Check liveness and dependencies | `GET /health/dependencies`; read-only service health and logs |
| Read chain projection checkpoint progress | `node scripts/operator-access.mjs todo chain-progress` |
| Read configured mail mode / switch safely to sink | `node scripts/operator-access.mjs account mail-status` / `mail-sink` |
| Read bounded, redacted operator audit | `node scripts/operator-access.mjs account access-audit [limit]` / `node scripts/operator-access.mjs todo access-audit [limit]` |
| Read bounded mail-mode audit | `node scripts/operator-access.mjs account mail-audit [limit]` |
| Read queue progress, replay a notification, rebuild a projection, or verify erasure | Existing service commands are available, but currently run through Docker Compose; a restricted non-Docker launcher remains deployment wiring |
| Backfill workspace ownership | Existing script defaults to dry-run; apply requires review and is not in the restricted CLI |

Other consumer DLQ replay, arbitrary event replay, direct SQL, database
restores, chain transactions, and release rollback are not routine operator
actions. Use their separately approved maintenance/release process; do not
substitute an unrestricted database console, `rabbitmqadmin`, queue purge, or
manual edits to application state.

The new Account and Todo migrations define three dedicated, non-login group roles:

| Database | Routine role | Break-glass audit writer | Audit reader |
| --- | --- | --- | --- |
| Account | `account_routine_operator` | `account_break_glass_operator` | `account_operator_auditor` |
| Todo | `todo_routine_operator` | `todo_break_glass_operator` | `todo_operator_auditor` |

These roles are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOLOGIN
NOINHERIT`. Routine and break-glass roles have no table privileges. The
break-glass role can only call the approved open/close audit functions. The
audit-reader role can only call a bounded, redacted audit function. No login,
membership, password, or `CONNECT` grant is created by the migrations.

The bounded non-Docker CLI is run from an operator host with a database endpoint
reachable through the approved network path. The endpoint and scoped login
credentials are provisioned by the deployment's protected environment/secret
store, not passed on the command line and not taken from the application
`DATABASE_URL`:

```powershell
npm run ops:restricted -- account mail-status
npm run ops:restricted -- account mail-sink
npm run ops:restricted -- account mail-audit 20
npm run ops:restricted -- account access-audit 20
npm run ops:restricted -- todo chain-progress
npm run ops:restricted -- todo access-audit 20
```

`ops:restricted` accepts exactly `<account|todo> <action> [limit]`. Supported
arguments are `account mail-status`, `account mail-sink`, `account mail-audit
[limit]`, `account access-audit [limit]`, `todo chain-progress`, and `todo
access-audit [limit]`. Audit limits default to 20 and must be integers from 1
through 50. The `--` separates npm's arguments from the operator CLI arguments.

Set only the corresponding server-provisioned `ACCOUNT_OPERATOR_DATABASE_URL`
or `TODO_OPERATOR_DATABASE_URL` in the protected environment. The login must
be an individually provisioned PostgreSQL `LOGIN` role, a member only of the
corresponding non-login routine-operator group, and must not be an application service or
database-owner credential. For example, after creating the named login and
storing its credential securely, the database administrator grants
`account_routine_operator` or `todo_routine_operator` membership to that login.
Do not share operator login roles: `session_user` is the identity reported by
the CLI and stored in the mail-mode audit.

Account routine functions provide configured mail-mode status, an idempotent
audited switch to the safer `sink` mode, a bounded mail-mode audit view, and a
bounded redacted break-glass audit view. They never enable external delivery or
report whether external provider credentials are effective. Todo routine
functions provide bounded chain-projection checkpoint progress (not RabbitMQ
queue lag) and the same redacted access-audit view. The functions are
`SECURITY DEFINER` with a
fixed search path, expose no SQL input, and return only the listed fields. The
routine identity has no direct access to the underlying tables, even for reads
or writes.

The existing Compose service and migration credentials remain broad
application/database-owner credentials; do not expose them to routine
operators. The database boundary is least-privilege only for separately
provisioned operator logins. Docker/host access remains a separate deployment
control: this database work does not enforce least privilege for Docker
administrators or expose every existing operator task through the restricted
non-Docker CLI.

## Local Compose OP-8 integration status

On 2026-10-03, OP-8 was applied and exercised against the already-running local
Compose databases (`account_db` and `todo_db`). The four operator-control and
scoped-routine migrations are recorded in their respective migration tables.
Only those OP-8 migrations were targeted; no database was recreated, no
business rows were modified, and no `up`, `restart`, or `down` command was used
against existing services. No PostgreSQL host-port bindings were added.

The Account database had an older migration gap before OP-8:
`015_create_dlq_operation_audit` and `016_create_owner_event_replay_audit`
were absent. The two reviewed, additive audit-table migrations were subsequently
applied using a bounded two-migration maintenance invocation. Routine operator
access to both new tables remains denied.

Because the runner orders history by `run_on`, then `id`, installing the missing
tables alone did not repair the order guard. With separate explicit operator
approval, four ordering records were normalized transactionally after preserving
their original IDs and exact execution timestamps in the append-only
`migration_order_maintenance_receipts` record
`a72f6ffd-bd84-4a92-af89-5774866f2de5`. The original execution times in that
receipt, not the normalized ordering timestamps, are the historical evidence.
No business rows, operator permissions, or break-glass audit records were changed.
The normal `docker compose run --rm --no-deps account-migrations npm run migrate`
then passed with "No migrations to run" and no order-check override. Do not
generalize this approved repair into disabling order checks for deployments.
Todo had its prior
migrations through `20261003110000_index_published_outbox_events`; only its
two OP-8 migrations were applied.

Two individually named LOGIN roles are provisioned: `local_account_operator`
is a member only of `account_routine_operator`, and `local_todo_operator` is a
member only of `todo_routine_operator`. Both are non-superusers without
database/schema creation, role-creation, or RLS-bypass privileges. Effective
checks found no direct public-schema table or sequence privileges, and no
break-glass or auditor membership. Their connection URLs are stored in the
Git-ignored, Windows-ACL-restricted files
`secrets/operators/account.env` and `secrets/operators/todo.env`; each contains
only that service's operator URL. The URLs use Compose-internal hostnames
(`account-postgres` / `todo-postgres`) and are reachable only from the Compose
network. No database port is published to the host, so these local files do
not make the host-side `npm run ops:restricted` commands reachable yet. Do not
publish a database port to work around this; provide an approved private
operator network endpoint before using the CLI from a non-Docker host.

The CLI was run with each actual dedicated login from inside the existing
Compose network. Account `mail-status`, `mail-audit`, and `access-audit`
initially returned one, one, and zero rows respectively; Todo `chain-progress` and
`access-audit` initially returned one and zero rows. After the exercises, the
same actual CLI reads returned Account counts of one, six, and two, and Todo
counts of one and two. Application-owner URLs were rejected in both services
with "Database login is not a dedicated routine operator identity".
Direct reads of each service's
operator audit table and underlying configuration/checkpoint table were
denied. The mail write command was not run, external delivery was not enabled,
and no real mail was sent.

An audit-only break-glass integration exercise was also completed in each
database using a separate temporary LOGIN identity with only its corresponding
break-glass group membership. Self-approval, an overlong expiry, and a malformed
digest were rejected; a synthetic open/close pair was appended with outcome
`aborted`. The temporary identities were dropped immediately afterward; the
four append-only audit rows remain as evidence. No business SQL was executed.
The synthetic references are `OP8-AUDIT-ONLY-account-4d289d0d` and
`OP8-AUDIT-ONLY-todo-7bef7623`, with two open/close rows each.
This was a database-function exercise, not approval for an operational
break-glass incident or a substitute for the incident-system approval and
backup requirements above.

The final Compose status snapshot also showed the Account and Todo cleanup
workers restarting; PostgreSQL and the API services were running. No worker
logs were inspected or worker changes made, so this execution does not
determine the cause or attribute those restarts to OP-8.

## Break-glass approval and audit

Break-glass is for a documented incident or approved maintenance only, when no
supported service command can safely complete the task. Before access:

1. Record the incident/change reference, target database, operator, distinct
   approver, reason, exact SQL statement(s), expected effect, and a SHA-256
   digest of the reviewed statement set in the approved incident system.
2. Take and verify a backup before any write. Use a separately provisioned,
   time-limited identity with only the required access; never reuse the
   application-owner credential.
3. Call the database's `begin_{account|todo}_break_glass` function with the
   incident reference, operator, approver, statement digest, and expiration.
   The function rejects self-approval, malformed identifiers/digests, and
   approval windows longer than one hour. The operator must match the
   authenticated database login, and the function records the actual database
   and login role without storing SQL text.
4. Perform only the approved statements. Capture command output in the
   restricted incident record, redact personal data, and verify application
   health and affected records.
5. Call `close_{account|todo}_break_glass` from the same login session with
   outcome `completed` or `aborted`. Revoke the temporary identity's grants,
   record verification and closure, and retain the audit evidence under the
   incident policy.

The database audit is append-only for row updates, deletes, and truncation, and
the writer role cannot read or modify the audit table directly. Database owners
and superusers remain privileged and can bypass database controls; keep them
out of the operator path and ship/retain database audit evidence outside the
database under the organization's incident-retention controls. Never manually
edit outbox, delivery, workflow, migration-history, or chain-state rows to force
progress. If a safe statement set or recovery is unclear, stop and escalate.

Rolling back a base access-control migration drops its audit table and roles.
Rolling back a scoped-routine migration removes the corresponding CLI database
functions; export and retain audit evidence and review the restored privileges
before doing so. Revoke any external role memberships before rollback; do not
use rollback as an audit cleanup mechanism.

## Isolated OP-8 rehearsal

The verifier is intentionally not wired into a package script. Run it directly
against a newly created disposable PostgreSQL database after applying the
matching service migrations. It never loads `.env`, reads an application
database URL, creates or drops a database, or changes an existing Compose
service. Its default contract refuses non-loopback connections and database
names outside the `op8_scratch_account_*` / `op8_scratch_todo_*` patterns.

For an OP-10 rehearsal that must run inside the isolated `todo-service`
container (with no host port published for PostgreSQL), a separate container
target is allowed only when all of these conditions hold:

- Set both `OP8_CONTAINER_REHEARSAL=1` and `OPERATIONS_REHEARSAL_ISOLATED=1`.
- `DAY4_COMPOSE_PROJECT` exactly equals `COMPOSE_PROJECT_NAME`, and the value
  starts with `todo-day4-verify-`.
- `OP8_SCRATCH_DATABASE_URL` uses exactly `account-postgres` with a scratch DB
  ending in `_account`, or exactly `todo-postgres` with a scratch DB ending in
  `_todo`. Allowed database names match
  `op8_scratch_<suffix>_<account|todo>` or
  `op10_scratch_<suffix>_<account|todo>`, with the name suffix matching the
  service hostname.
- The PostgreSQL URL has no query parameters or fragment and may not override
  the target host or database. The verifier never falls back to application
  `ACCOUNT_DATABASE_URL` or `TODO_DATABASE_URL`.

The container opt-in is rejected unless the isolation flag and project binding
are both present. Never use it against the default Compose project or an
application database. Without this explicit opt-in, only the original loopback
scratch URL pattern is accepted.

Example for a disposable local PostgreSQL instance (not the application
Compose stack):

```powershell
$containerId = docker run --rm -d `
  -e POSTGRES_HOST_AUTH_METHOD=trust `
  -e POSTGRES_USER=op8_rehearsal `
  -e POSTGRES_DB=op8_scratch_todo_rehearsal `
  -p 127.0.0.1::5432 postgres:17-alpine

$port = (docker port $containerId 5432/tcp).Split(':')[-1]
$env:OP8_SCRATCH_DATABASE_URL = "postgres://op8_rehearsal@127.0.0.1:$port/op8_scratch_todo_rehearsal"
$env:DATABASE_URL = $env:OP8_SCRATCH_DATABASE_URL
npm run migrate -w @todo/todo-service
node scripts/verify-operator-access.mjs

Remove-Item Env:OP8_SCRATCH_DATABASE_URL
Remove-Item Env:DATABASE_URL
docker rm -f $containerId
```

For Account, use a separate database named `op8_scratch_account_rehearsal`,
set the matching scratch URL and `DATABASE_URL`, then run
`npm run migrate -w @todo/account-service` before the verifier. The container
binds its random host port to loopback only and has no persistent volume. Stop
and remove only the container created for the rehearsal.

The rehearsal checks role attributes and effective table/function grants,
creates a temporary individual LOGIN role with only routine membership, and
connects as that actual login (without `SET ROLE`). It proves the login can run
the scoped mail/progress and redacted audit functions but cannot read or mutate
the underlying tables. The break-glass exercise rejects self-approval and
overlong-expiry requests, writes and closes a synthetic audit event, then
confirms the event cannot be updated or deleted. It reports no connection URL,
SQL text, or secret. Keep the two synthetic audit rows in the disposable
database as evidence; discard that scratch instance after recording the
verifier result.

On 2026-10-03, both service migrations and the verifier passed against separate
databases in a temporary PostgreSQL 17 instance bound to loopback. The verifier
confirmed that actual routine LOGIN roles could run their allowed functions
without `SET ROLE`, while direct application/audit-table access was denied;
break-glass functions rejected self-approval and invalid windows/digests and
created an immutable two-row open/close audit trail. The scratch instance was
removed; no application Compose database or credential was used. This proves
the database role/function boundary, not production credential provisioning or
Docker/host-level least privilege.
The Account mail-status missing-row error guard was added after this rehearsal;
re-run the Account scratch migration and verifier before treating that final SQL
change as integration-tested.
