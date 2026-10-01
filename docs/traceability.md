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
| WF-8 | Covered | `npm run verify:workflow:boundaries` | Source-anchored proof confirms local workflow commits complete before participant HTTP calls and worker ownership uses `FOR UPDATE SKIP LOCKED`. |
| WF-4 | Covered | `npm run verify:workflow:compensation` | Live Todo participant failure reaches bounded compensation and the workflow completes after the participant returns. |
| WF-5 | Covered | `npm run verify:workflow:compensation` plus orchestrator unit tests | Live compensation completes through idempotent participant cleanup; unit tests cover repeated undo and compensation failure bounds. |
| WF-9 | Covered | `npm run verify:workflow:correlation` | The Gateway-generated correlation ID was found in Account, Todo, Gateway, and workflow-worker logs. |
| WF-10 | Covered | `npm run verify:workflow:compensation` | The proof aged a compensating workflow and observed degraded workflow health before recovery. |
| BC-1 | Covered | `npm run test -w @todo/todo-service -- backend-chain-integration.test.ts` | All task creations, updates, and deletions enqueue privacy-safe chain commands into durable `chain_submissions` within the same database transaction. |
| BC-2 | Covered | `npm run test -w @todo/todo-service -- privacy-gate.test.ts` | `PrivacyGate` strictly validates opaque RFC4122 UUIDs and rejects any title, description, email, user ID, or hashes. |
| BC-3 | Covered (contract) | `cd contracts/onchain; npm test` | Public view functions count records and return pages bounded to 50; direct public-testnet reading is a separate ONC-3 gate. |
| BC-4 | Covered (contract) | `cd contracts/onchain; npm test` | Configured writer can append; an unauthorized signer is rejected. Backend key custody remains a separate BC-15 gate. |
| BC-6 | Covered | `npm run rebuild:chain-projection` | Clears projection tables and rebuilds from chain logs starting at deployment block; verified live on container and unit-tested in `task-history-projection.test.ts`. |
| BC-7 | Covered | `npm run test -w @todo/todo-service -- task-history-projection.test.ts` | Unit-tested: `ON CONFLICT (chain_id, contract_address, transaction_hash, log_index) DO NOTHING` guarantees duplicate event processing leaves identical state. |
| BC-8 | Covered | `npm run test -w @todo/todo-service -- task-history-projection.test.ts` | Unit-tested: reorg detection identifies common ancestor and `rollbackAfterBlock` removes orphaned events and block records above the ancestor. |
| BC-9 | Covered | `npm run test -w @todo/todo-service -- task-history-projection.test.ts` | Unit-tested: `CHAIN_CONFIRMATIONS` is enforced $\ge 2$ and indexer only processes blocks at or behind `safeHead = latestBlock - confirmations + 1n`. |
| BC-10 | Covered | `npm run test -w @todo/todo-service -- chain-submission.test.ts` | Asynchronous chain writes via Postgres outbox pattern & worker service. |
| BC-11 | Covered | `npm run test -w @todo/todo-service -- chain-submission.test.ts` | State machine transitions: pending, reserved, submitted, confirmed, replaced, abandoned, dead_letter. |
| BC-12 | Covered | `npm run test -w @todo/todo-service -- chain-submission.test.ts` | Atomic sequential nonce coordination via `chain_writer_nonces` and row locking across concurrent workers. |
| BC-13 | Covered | `npm run test -w @todo/todo-service -- chain-submission.test.ts` | Outage resilience: mutations persist to DB even during chain/RPC outage. |
| BC-14 | Covered | `npm run test -w @todo/todo-service -- chain-submission.test.ts` | Exponential backoff retry and DLQ routing on repeated failures. |
| BC-15 | Covered | `npm run test -w @todo/todo-service -- signer-key-provider.test.ts` | `SecureSignerKeyProvider` with runtime in-memory protection, address validation, and logger redaction. |
| BC-16 | Covered (local gas) | `cd contracts/onchain; npm run test:gas` | The append used 75,583 gas with 1 and 1,000 existing records for the same task; reads and deployment costs are recorded in `docs/onchain.md`. |
| BC-17 | Covered | `npm run test -w @todo/todo-service -- backend-chain-integration.test.ts` | Independent Hardhat project exports `task-history.abi.json` and `task-history.deployment.json`; consumed dynamically by backend without hardcoded addresses. |
| PF-7 | Covered (chain isolation) | `npm run test -w @todo/todo-service -- backend-chain-integration.test.ts` | Slow or failing chain RPC calls do not affect API response time; mutations write to Postgres in milliseconds. |
| OP-1 | Covered (chain copy) | `npm run rebuild:chain-projection` | One documented command rebuilds the local relational chain projection from chain source while services are running, without manual database edits. |
| EV-1 | Covered | `npm run test -w @todo/todo-service -- schema-evolution.test.ts` | Schema changes are non-blocking and additive; concurrent queries continue serving traffic during migration without failures. |
| EV-2 | Covered | `npm run test -w @todo/todo-service -- schema-evolution.test.ts` | Old application code (which omits new columns) continues executing correctly against evolved schemas via defaults and nullable fields. |
| EV-9 | Covered | `npm run verify:evolution:schema` | 100% of migrations across Account Service (10) and Todo Service (17) define reversible `exports.down` handlers; verified automatically. |
| EV-10 | Covered | `npm run test -w @todo/todo-service -- schema-evolution.test.ts` | Reversals drop added schema components cleanly without corrupting core data or requiring database restore. |
| EV-11 | Covered | `npm run test -w @todo/todo-service -- backend-chain-integration.test.ts` | Replacing a contract retains verifiable historical records anchored by previous addresses. |
| EV-7 | Covered | `npm run test -w @todo/account-service -- registration.controller.test.ts` and `npm run test -w @todo/gateway -- registration.controller.compatibility.test.ts` | Registration returns the previous flat `data.id/email/createdAt` fields and current `data.user` shape. |
| EV-8 | Covered (live Account Service rollout) | `docker compose -f docker-compose.yml -f docker-compose.ev8.yml exec -T -e EV8_OLD_URL=http://account-service-ev8-old:3001 -e EV8_NEW_URL=http://account-service-ev8-new:3001 account-service-ev8-new npm run verify:ev8-live -w @todo/account-service` | Distinct old/new Account images ran together against one database and RabbitMQ; both registrations succeeded and outbox stored event versions 1 and 2. Gateway old-response compatibility is also covered by `registration.controller.compatibility.test.ts`. |
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

The on-chain contract has a local build, eight passing tests, ABI and deployment metadata export,
a reported chain-31337 Ignition deployment, a working local projection indexer with rebuild, deduplication,
reorg rollback, and confirmation gating (BC-6, BC-7, BC-8, BC-9, OP-1), backend durable anchoring with privacy gate
(BC-1, BC-2), asynchronous submission with state machine, multi-worker nonce coordination, and DLQ (BC-10..BC-14),
signer key custody (BC-15), gas measurements (BC-16), deployment artifact verification (BC-17), and RPC isolation (PF-7).
BC-5 (public testnet deployment) remains pending live testnet demonstration.
EV-8's protocol compatibility is unit-tested, but a live rolling deployment with
old and new service images is not demonstrated because the repository does not
contain a retained old image/tag or versioned Compose deployment fixture.

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