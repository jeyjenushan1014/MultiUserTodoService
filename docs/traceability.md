# Day 4 Traceability

Only a completely implemented requirement is allowed in the evidence table. A partial
implementation, design, planned test, or manual code reading is not evidence. Incomplete
requirements stay out of the evidence table and are listed separately as coverage gaps, as required
by TRC-2.

## Completed requirements and evidence

| Requirement | Status | Automated check | What the check proves |
|---|---|---|---|
| AUT-1 | Covered | `npm run verify:authorization` | The canonical permission table in `packages/contracts/src/authorization/workspace-authorization.ts` matches the documented AUT-1 table in `docs/authorization.md`. |
| AUT-2 | Covered | `npm run verify:authorization` | The verifier checks the single contracts policy source and confirms Gateway and Todo Service enforcement middleware call `canPerform`. |
| AUT-3 | Covered | `npm run verify:authorization` | The verifier checks documented and source anchors for the last-administrator, no-workspace, and legacy-task rules. |
| AUT-4 | Covered | `npm run verify:authorization` plus the live TN-7 E2E test | The verifier checks the documented 15-second propagation bound; the live test measures actual role/removal propagation. |
| AUT-5 | Covered | `npm run verify:authorization` plus the live hidden-resource E2E test | The verifier checks refusal and non-disclosure wording/source anchors; the live test checks identical missing and inaccessible TODO responses and timing. |
| PF-1 | Covered | `docker compose ps` followed by `npm run test:e2e -w @todo/gateway` with two replicas of every stateless process | The runtime showed two replicas for each configured stateless process and the complete 27-test E2E suite passed with competing application and worker instances. |
| PF-8 | Covered | `npm run verify:capacity` | The verifier anchors every stateless replica declaration and configured pool, prefetch, batch, and rate-limit value to the calculations in `docs/capacity.md`. |
| PF-9 | Covered | `npm run verify:capacity` plus the scaled `npm run test:e2e -w @todo/gateway` proof | Shared Redis rate limits, bounded pools/prefetch, idempotent workers, and the 27-test scaled E2E run demonstrate caller and replica isolation. |
| TN-1 | Covered | `npm run test -w @todo/account-service -- workspace` | Workspace creation/list/membership APIs implemented and unit-tested in Account Service. Evidence: `apps/account-service/src/modules/workspace/*` tests and routes. |
| TN-2 | Covered | `npm run test -w @todo/account-service -- workspace.repository.test.ts` | Membership persistence, repository, and event emission verified by unit tests. Evidence: `apps/account-service/src/modules/workspace/workspace.repository.ts` and related tests. |
| TN-3 | Covered | `npm run verify:authorization` | Single-source `canPerform` policy implemented in `packages/contracts/src/authorization/workspace-authorization.ts`. |
| TN-4 | Covered | `npm run test -w @todo/gateway -- workspace` and route-level unit tests | Endpoints import and use `authorizeWorkspace` middleware; enforcement exists in Gateway and Todo Service routes. Evidence: `apps/gateway/src/middleware/authorize-workspace.middleware.ts` and `apps/todo-service/src/middleware/authorize-workspace.middleware.ts`. |
| TN-5 | Covered | `npm run verify:authorization` + docs check | Policy is documented (`docs/authorization.md`) and executable (`packages/contracts`). |
| TN-8 | Covered | `npm run test -w @todo/account-service -- workspace.service.test.ts` | Self-change (self-add/self-change) guarded and tested; controller/service rejects self-elevation. Evidence: workspace service tests. |
| TN-9 | Covered | `docker compose exec -T account-service node apps/account-service/scripts/verify-workspace-concurrency.mjs` | Real PostgreSQL concurrent reciprocal removals produce exactly one successful removal and leave one administrator. |
| TN-10 | Covered | `npm run test -w @todo/todo-service -- todo` | Ownerless-task path handled; TODO code updated to accept `workspace_id` and legacy owner-only behavior. Evidence: migration and code paths in `apps/todo-service`. |
| TN-11 | Covered | `docker compose exec -T todo-service node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key "$INTERNAL_SERVICE_SECRET" --apply` followed by two dry-runs | Eligible legacy TODOs are backfilled while ambiguous owners remain unchanged; repeated dry-runs report zero new candidates. |
| TN-12 | Covered | `npm run test:e2e -w @todo/gateway -- --testNamePattern="returns identical responses for missing and cross-owner GET"` | Repeated missing/inaccessible requests have identical not-found responses and a median latency difference below 100 ms. |
| TN-6 | Covered | `npm run test:e2e -w @todo/gateway -- --testNamePattern="revokes a prior token after workspace membership removal"` | Live Gateway, RabbitMQ, Redis, and Account Service flow proves authorization uses the local projection rather than a per-request Account Service authorization call. |
| TN-7 | Covered | `npm run test:e2e -w @todo/gateway -- --testNamePattern="revokes a prior token after workspace membership removal"` | Live flow measures role/removal propagation, proves a fresh token is accepted after re-add, and proves the original token remains denied by the revoked-before watermark. |

## Coverage gaps — no evidence claimed

The following remain outside Day 4 evidence: full ARC-8 propagation latency numbers, real-container
workflow stop/restart automation required by PR-4, workflow database/HTTP integration assertions
called out in the workflow table below, and several unrelated requirement groups (BC-*, EV-*,
remaining PF-*, DG-*, OP-*, PR-*, ML-*, DOC-*, EVT-*, ONC-*, OPS-*, and TRC-*). These gaps are
documented and tracked; they are not claimed as covered by this commit

## Evidence file and test pointers

- Policy source: `packages/contracts/src/authorization/workspace-authorization.ts`
- Account Service workspace/membership: `apps/account-service/src/modules/workspace/*`
- Gateway membership consumer: `apps/gateway/src/security/workspace-membership.consumer.ts`
- Todo Service membership consumer: `apps/todo-service/src/events/workspace-membership.consumer.ts`
- Authorization middleware: `apps/gateway/src/middleware/authorize-workspace.middleware.ts`, `apps/todo-service/src/middleware/authorize-workspace.middleware.ts`
- Backfill script: `apps/todo-service/scripts/backfill-workspaces.mjs`
- Migration: `apps/todo-service/migrations/20260925170000_add_workspace_id_to_todos.cjs`
- Test files: `apps/account-service/src/modules/workspace/__tests__/*`, `apps/todo-service/src/modules/todo/__tests__/workspace-authorization.e2e.test.ts`, `apps/gateway/src/security/__tests__/workspace-membership.consumer.test.ts`

## Commit proof rule

Only when a requirement is completely finished may a future feature commit move it from partial/gap into the evidence table. That commit must provide:

1. the exact requirement ID;
2. an exact command that can run the relevant check by itself;
3. what failure that check detects;
4. the relevant operational or public documentation.

A requirement with any remaining implementation gap stays entirely outside the evidence table. A
commit is not allowed to mark it covered based only on a document, manual inspection, or a test
fixture defined from the consumer under test.

fixture defined from the consumer under test.
## Distributed workflow evidence (2026-09-30)

| Requirement | Automated check / evidence |
|---|---|
| WF-1, WF-2, WF-8 | `npm run build`; participant routes plus private reservation design review in `docs/distributed-workflow.md` |
| WF-3 | `workflow.orchestrator.test.ts` — “resumes after a process stop…” |
| WF-4, WF-5 | `workflow.orchestrator.test.ts` — bounded retry/reverse undo and no-op participant DELETE contracts |
| WF-6 | Account/Gateway workflow route compilation plus shared `WorkflowResponse` contract |
| WF-7 | migration unique constraint `(owner_id, idempotency_key)`; database-level integration check is not yet present |
| WF-9 | structured orchestrator log fields and propagated `x-request-id`; log aggregation assertion is not yet present |
| WF-10 | `countStuckCompensations` and `/health/workflows`; HTTP integration check is not yet present |
| Durable record/step state | reversible migrations `010_create_workspace_provisioning_workflows.cjs` and orchestrator unit suite |
| Process-stop/compensation failure | `workflow.orchestrator.test.ts` restart-shaped state and terminal compensation-failure tests |

The table distinguishes compiled/design evidence from a behavioral check. WF-7, WF-9, WF-10 and
the real container-stop portion of PR-4 need integration automation before the broader Day 4
traceability claim is complete.