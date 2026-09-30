# Day 4 Verification Baseline

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
$env:DAY4_KEEP_STACK = "1"
npm run verify:day4
Remove-Item Env:DAY4_KEEP_STACK
```

## Scope Boundary

This command proves the currently implemented application and evidence checks. It does not
claim unfinished Day 4 systems such as workflow orchestration, blockchain anchoring, two-instance
runtime, account deletion/export, external mail, load testing, backup restore, or PR-8 deliberate
breakage coverage. Those remain unchecked in `docs/day-4-checklist.md` and `docs/traceability.md`.
