# Day 4 Verification Baseline

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
