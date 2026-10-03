# Day 4 Verification Baseline

## 2026-10-03 requested operational completion work

`npm run verify:day4 -- --clean-clone --operations-only` passed with exit code 0
at committed revision `5515a4ce9d1547463095ed9adc4d8a6fd57ecf08`.
Project: `todo-day4-verify-1791048283836-6e7b4a89b9`. The non-secret receipt
is `.verification/todo-day4-verify-1791048283836-6e7b4a89b9-result.json`
and records `sourceKind: committed-clean-clone`, `cleanCommittedSource: true`.

Measured passing surfaces:

- Node 24 workspace compilation, 40 operations tests, ten targeted owner-replay
  tests, documentation/authorization checks and 30 live Gateway E2E tests.
- All three actual DLQs: redacted inspection, selected-event replay, unrelated
  message preservation, retry-header reset, confirmation and durable audit.
- History half-open range selection, exact 100/101 cap and duplicate suppression;
  owner replay with actual consumer receipts, repeat suppression, deletion
  tombstones, cross-consumer isolation and queued/already-processed audit.
- RabbitMQ stop/restart: actual Gateway registration remained durable in the
  unpublished Account outbox, then reached the real owner consumer on recovery.
- Audited sink-only mail mode/retry/quota, workspace concurrency, two backfill
  dry-runs and two real projection rebuilds with running indexers.
- Six consumers reported ready/unacknowledged counts of zero and two consumers
  each, both before and after restart. Chain 31337 latest block 34,
  safe head/checkpoint block 33, lag zero.
- Actual Account/Todo `pg_dump`, scratch `createdb`, `pg_restore --exit-on-error`,
  nonempty source/restored row-count comparison, dump catalogue validation,
  restricted-login CLI, denied raw access, append-only break-glass and `dropdb`.
- Three-replica retained-tag switch and deliberate failed-health restoration.
  This remains same-build mechanics, not genuine historical-release proof.

All verification containers, networks and named volumes were removed. No host
ports, external mail, public-chain transactions or live application data resets
were used. This closes the requested operational command inventory, not the
separately excluded full chain-fault/historical migration suite or exhaustive
repository-wide OP-10/PR proof. Historical failed runs below remain preserved.

A subsequent full committed-clone run,
`todo-day4-verify-1791049391940-9d511ad083`, passed lint/build/unit checks,
all real migration reversals and previous-code HTTP traffic, but failed the
then-one-shot aggregate dependency health check before E2E. Cleanup passed;
no full-suite success is inferred. Dependency readiness now uses a bounded
two-minute wait requiring an actual HTTP 200/healthy result, with persistent
failure diagnostics. The operations suite now has 41 passing tests, including
degraded/connection-failure recovery and deadline rejection. Broker-user
diagnostics are also wired into the normal Compose healthcheck and separate
mail rehearsal, without recreating an existing live service.

The earlier owner-replay PostgreSQL `42P08` failure was traced to inconsistent
inference of audit status parameter `$5`. Both uses now explicitly cast to
`varchar`. All ten targeted owner-replay Vitest tests and all ten focused
verifier-isolation Node tests pass. The committed live broker rehearsal above
also passes this database fix; it is not inferred from mocked unit tests.

The verifier now treats `--clean-clone` as committed source, never as an alias
of `--working-tree`, and offers a separately scoped `--operations-only` run.
It generates ephemeral configuration, waits for infrastructure before worker
startup, exercises broker stop/restart, provisions scratch restricted logins,
and verifies real nonempty Account/Todo backups restored into scratch databases.
Skipped full chain and historical migration checks are not claimed by the
operational scope.

Project `todo-day4-verify-1791045702713-5291aec51e` failed before operational
replay at the historical migration verification's 240-second deadline.
Docker Engine also returned an API 500 and automatic cleanup failed.
The isolated project's secret-free cleanup manifest was subsequently used to
remove that project's containers, networks and volumes successfully; no live
application resources were reset. The failure receipt is retained separately
under `.verification`. This is not aggregate success or clean-clone evidence.

Project `todo-day4-verify-1791047109041-e5bfb61c5f` subsequently passed the
Node 24 workspace build, 40 operations tests, documentation and authorization
checks, but RabbitMQ failed before workers started. The retained redacted logs
showed an Erlang cookie permission error (`eacces`), not a consumer failure.
The isolated healthcheck now executes under the broker's own user to avoid
root-owned cookie creation during startup. That failed project's cleanup passed.
OP-8 scratch databases now use real backup/restores of the migrated disposable
databases rather than reapplying cluster-global role-creation migrations.

Live OP-8 provisioning subsequently passed on the existing local databases,
including actual CLI invocation with dedicated logins and rejected owner
credentials. Two audit-only open/close rows persist per database. The earlier
choice to leave live permissions unchanged is therefore superseded by the
operator's later authorization. Missing Account replay audit tables and the
resulting migration-order issue were repaired with explicit approval and an
immutable original-metadata receipt; normal migration verification now passes.
See [operations-access.md](operations-access.md) for measured commands, references
and the remaining private-network/administrator-maintenance boundaries.

## 2026-10-03 priority-review remediation

The isolated working-tree snapshot passed all 28 real Gateway E2E tests, including
competing updates against the same observed task version: exactly one succeeded and
the stale update returned `409 TODO_VERSION_CONFLICT`.

The real PostgreSQL 17 verifier executed up/down for every discovered migration:
19 Account + 26 Todo = 45 (the previous 43 plus two remediation migrations).
It checked surviving core rows, catalog restoration, guarded rollback refusal and
frozen previous-production GET repository HTTP traffic overlapping actual DDL.
This is not full historical authenticated-service/write compatibility.

Real application/chain checks passed HTTP creation during an RPC outage, a cold
nonce-counter race, 12 API tasks through two deployed writers, process death after
actual broadcast before acknowledgement, exactly-once recovery of the original hash,
two actual compatible contract deployments with production projection/read-back,
and a failing submission reaching the human-review queue at exactly five failures.

The aggregate rehearsal then stopped because the mail-retry verifier lacked an
operator identity. Passing the isolated verifier identity fixed that check, which
was rerun successfully. Separately, the current compiled indexer/rebuild artifacts
were installed into that disposable stack: two consecutive rebuild commands passed
with both indexers and both Todo API replicas remaining running.
These targeted reruns are not a completed aggregate verification run.

The subsequent complete working-tree snapshot rerun also passed `npm run check`,
all 28 live E2E tests, all 45 migration reversals, every real chain check above,
sink-only mail mode/retry/quota checks, workspace concurrency, and both rebuilds
without stopping indexers. Progress showed two consumers for each of six queues,
zero ready/unacknowledged messages and a caught-up chain checkpoint.

That aggregate rerun failed later in the existing Account owner-event replay
rehearsal: PostgreSQL reported `42P08`, inconsistent types for parameter `$5`
(`text` versus `character varying`) in `replay-owner-events.mjs`'s `insertAudit`.
No aggregate success is claimed; operator replay and the remaining aggregate
steps are still unproven. The isolated containers, network, volumes, image aliases
and generated signing key were cleaned up.

A final resource audit found that Compose's stripped cleanup model left its
unreferenced named volumes behind. Cleanup now retains named-volume mounts but
omits secret bind mounts/environment. All nine focused verifier tests passed,
and a separate real Compose create/down rehearsal proved removal of the named
volume and container. The ten confirmed leftover volumes from the last two
disposable projects were explicitly removed; no application-stack volumes were
touched.

Automatic fee replacement/audited chain replay, public application-to-Sepolia traffic,
ABI-changing contract replacement, and exhaustive historical-release rollback remain
explicit gaps in [traceability.md](traceability.md).

## 2026-10-03 operator completion verification

The current working-tree implementation passed `npm run check`: 517 Vitest assertions
passed; 27 live Gateway tests were intentionally skipped in that unit-only invocation.
The isolated Node.js 24 clean-source verification subsequently passed all 27 live Gateway
E2E tests, API documentation (21 endpoints), authorization verification, fresh Account/Todo
migrations, local TaskHistory deployment, workspace concurrency, and two consecutive
workspace-backfill dry-runs and chain-projection rebuilds. Six consumer queues each had
two consumers and zero ready/unacknowledged messages; the initialized chain checkpoint
was caught up.

The first end-to-end operator rehearsal stopped on a test assertion comparing the
string-valued `MAIL_TEST_SINK_ONLY` setting to boolean `true`. That assertion has been
corrected to `"true"`. A complete retry must pass before OP-2/extra OP-3/OP-10 are closed;
the preceding successful checks do not turn that failed aggregate run into a pass.

Separate completed evidence:

- `npm run verify:rollback`: isolated three-replica image-reference switch and deliberately
  failed-health restoration passed; its project and temporary image aliases were removed.
  Both retained tags refer to one built fixture image, so this is mechanics evidence,
  not historical-release/schema compatibility evidence.
- Fresh isolated PostgreSQL 17 Account and Todo migrations plus actual restricted-login CLI,
  denied direct table access, and audited break-glass open/close verification passed.
  The operator explicitly chose not to apply those permissions or provision identities on
  the live deployment.

The new verifier's default is a committed clean clone. `npm run verify:day4 --
--working-tree` installs a clean, filtered source snapshot for uncommitted changes without
making a source commit. Snapshot evidence is identified as such; it is not proof that
the uncommitted files exist in `HEAD`. See [verification.md](verification.md) for
isolation, cleanup, source-digest receipts, and excluded real-world actions.

## Historical baseline (2026-09-30)

Date: 2026-09-30
Branch: `main`
Command: `npm run verify:day4`
Environment: Windows host, Docker Compose, Node.js 22 host runtime, Node.js 24 container runtime

## Result

The clean-clone verification command passed for all currently implemented checks and then
removed the disposable Compose stack, network, and volumes.

Observed evidence:

- Aggregate dependency health became `healthy`.
- API documentation verified 19 public endpoints.
- Authorization proof passed AUT-1 through AUT-5 for 3 roles and 11 actions.
- Full Gateway E2E suite passed 27/27 tests.
- TN-9 concurrency proof passed with `results=changed,forbidden, administrators=1`.
- TN-11 repeatable dry-run found 7 TODOs without `workspace_id` and 2 eligible candidates.
- The command completed with `Day 4 verification passed for all currently implemented checks.`
- Default cleanup removed all containers, networks, and disposable volumes.

## Reproduction

```powershell
npm run verify:day4
```

To keep the stack for inspection instead of cleaning it up:

```powershell
npm run verify:day4 -- --keep
```

## Scope Boundary

This command proves the currently implemented application and evidence checks. It does not
claim unfinished Day 4 systems such as workflow orchestration, blockchain anchoring, two-instance
runtime, account deletion/export, external mail, load testing, backup restore, or PR-8 deliberate
breakage coverage. Those remain unchecked in `docs/day-4-checklist.md` and `docs/traceability.md`.
