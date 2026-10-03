# Day 4 Traceability

Only completely implemented requirements belong in the completed evidence table. Partial or
operator-reported results are listed separately with their remaining gaps and are not presented
as full automated coverage, as required by TRC-2.

## Completed requirements and evidence

| Requirement | Status | Automated check | What the check proves |
|---|---|---|---|
| AUT-1 | Covered | `npm run verify:authorization` | The canonical permission table in `packages/contracts/src/authorization/workspace-authorization.ts` matches the documented AUT-1 table in `docs/authorization.md`. |
| AUT-2 | Covered | `npm run verify:authorization` | The verifier checks the single contracts policy source and confirms Gateway and Todo Service enforcement middleware call `canPerform`. |
| AUT-3 | Covered | `npm run verify:authorization` | The verifier checks documented and source anchors for the last-administrator, no-workspace, and legacy-task rules. |
| AUT-4 | Covered | `npm run verify:authorization` plus the live TN-7 E2E test | The verifier checks the documented 15-second propagation bound; the live test measures actual role/removal propagation. |
| AUT-5 | Covered | `npm run verify:authorization` plus the live hidden-resource E2E test | The verifier checks refusal and non-disclosure wording/source anchors; the live test checks identical missing and inaccessible TODO responses and timing. |
| PF-1 | Covered | `docker compose ps` followed by `npm run test:e2e -w @todo/gateway` with two replicas of every stateless process | The runtime showed two replicas for each configured stateless process and the complete 28-test E2E suite passed with competing application and worker instances. |
| PF-8 | Covered | `npm run verify:capacity` | The verifier anchors every stateless replica declaration and configured pool, prefetch, batch, and rate-limit value to the calculations in `docs/capacity.md`. |
| PF-9 | Covered | `npm run verify:capacity` plus the scaled `npm run test:e2e -w @todo/gateway` proof | Shared Redis rate limits, bounded pools/prefetch, idempotent workers, and the 28-test scaled E2E run demonstrate caller and replica isolation. |
| PF-6 | Covered (real optimistic concurrency) | `npm run test:e2e -w @todo/gateway` against the isolated Day 4 stack | Real competing updates carrying the same observed task version yield exactly one success and one `409 TODO_VERSION_CONFLICT`; the persisted task equals the winner. All 28 live E2E tests passed on 2026-10-03. Legacy bodies remain accepted; clients must carry `expectedVersion` to reject stale edits made after a previous read. |
| PF-2 | Covered (createdAt keyset pagination) | `npm run verify:day4 -- --working-tree --pagination-only` | Passed on 2026-10-03 12:46 UTC: 30 live Gateway E2E tests including actual Redis cursor storage, caller isolation and all access/state/direction traversal combinations; 30 real PostgreSQL timing cases with 100,000 tasks/50,000 active shares and depths up to 90,000. Each deep p95 satisfied first p95 * 2 + 20 ms. Full measured table and source-snapshot receipt identity are in `docs/pagination.md`. Legacy offset pages/dueDate sorting are not the PF-2 keyset path; this is not PF-4/PF-5 evidence. |
| PF-3 | Covered (real endpoint round trips) | `npm run verify:performance` | Accepted isolated run on 2026-10-03 recorded actual internal endpoint round trips against real PostgreSQL/Redis via signed identity middleware. Call counts remained size-invariant across page sizes 1/20/100: `all/shared=4`, `owned miss=5`, `owned hit=1`. Receipt: `.verification/todo-day4-verify-1791039076330-7eb10846b2-result.json`. |
| PF-4 | Covered (read/write latency objectives) | `npm run verify:performance` | Accepted isolated run on 2026-10-03 measured 20 users for 300s on 20,000 seeded tasks. Read p95 `214.65ms` (<=300), write p95 `179.88ms` (<=500), read samples `2400`, write samples `600`, and zero measured errors/invalid responses. Receipt: `.verification/todo-day4-verify-1791039076330-7eb10846b2-result.json`. |
| PF-5 | Covered (automatic threshold gate) | `npm run verify:performance` | On the accepted run, objective evaluation exited `0` for measured data and deliberate breach exited exactly `1` with expected failures (`read: p95 objective breached`, `write: p95 objective breached`). Receipt: `.verification/todo-day4-verify-1791039076330-7eb10846b2-result.json`. |
| WF-8 | Covered | `npm run verify:workflow:boundaries` | Source-anchored proof confirms local workflow commits complete before participant HTTP calls and worker ownership uses `FOR UPDATE SKIP LOCKED`. |
| WF-4 | Covered | `npm run verify:workflow:compensation` | Live Todo participant failure reaches bounded compensation and the workflow completes after the participant returns. |
| WF-5 | Covered | `npm run verify:workflow:compensation` plus orchestrator unit tests | Live compensation completes through idempotent participant cleanup; unit tests cover repeated undo and compensation failure bounds. |
| WF-9 | Covered | `npm run verify:workflow:correlation` | The Gateway-generated correlation ID was found in Account, Todo, Gateway, and workflow-worker logs. |
| WF-10 | Covered | `npm run verify:workflow:compensation` | The proof aged a compensating workflow and observed degraded workflow health before recovery. |
| BC-1 | Covered | `npm run test -w @todo/todo-service -- backend-chain-integration.test.ts` | All task creations, updates, and deletions enqueue privacy-safe chain commands into durable `chain_submissions` within the same database transaction. |
| BC-2 | Covered | `npm run test -w @todo/todo-service -- privacy-gate.test.ts` | `PrivacyGate` strictly validates opaque RFC4122 UUIDs and rejects any title, description, email, user ID, or hashes. |
| BC-3 | Covered (contract and public demo) | `cd contracts/onchain; npm test`; operator-run `npm run demo:sepolia` | Local tests prove bounded reads; the Sepolia demo wrote a synthetic record after two confirmations and read count/history directly from Sepolia. |
| BC-4 | Covered (contract) | `cd contracts/onchain; npm test` | Configured writer can append; an unauthorized signer is rejected. Backend key custody remains a separate BC-15 gate. |
| BC-5 | Manual public deployment demonstrated | `cd contracts/onchain; npx hardhat ignition deploy ignition/modules/TaskHistory.ts --network sepolia`; operator-run `npm run demo:sepolia` | Sepolia chain 11155111 deployment at `0xF9b72407696e8D30FB43E17c77dB8B77bDb231E7`; source verified on Etherscan, Blockscout, and Sourcify; synthetic record read back after two confirmations. Evidence details are in `docs/onchain.md`. |
| BC-6 | Covered | `npm run rebuild:chain-projection` | Clears projection tables and rebuilds from chain logs starting at deployment block; verified live on container and unit-tested in `task-history-projection.test.ts`. |
| BC-7 | Covered | `npm run test -w @todo/todo-service -- task-history-projection.test.ts` | Unit-tested: `ON CONFLICT (chain_id, contract_address, transaction_hash, log_index) DO NOTHING` guarantees duplicate event processing leaves identical state. |
| BC-8 | Covered | `npm run test -w @todo/todo-service -- task-history-projection.test.ts` | Unit-tested: reorg detection identifies common ancestor and `rollbackAfterBlock` removes orphaned events and block records above the ancestor. |
| BC-9 | Covered | `npm run test -w @todo/todo-service -- task-history-projection.test.ts` | Unit-tested: `CHAIN_CONFIRMATIONS` is enforced $\ge 2$ and indexer only processes blocks at or behind `safeHead = latestBlock - confirmations + 1n`. |
| BC-10 | Covered (real local application pipeline) | `npm run verify:day4 -- --working-tree` | On 2026-10-03, HTTP creates queued real rows during stopped RPC; 12 new tasks subsequently passed PostgreSQL -> two deployed writers -> EVM -> deployed indexer with direct on-chain counts. Public Sepolia application traffic remains unproven. |
| BC-12 | Covered (real concurrent-worker proof) | `npm run verify:day4 -- --working-tree` | Passed cold nonce-row initialization races in actual PostgreSQL, then two deployed writers submitted 12 real API tasks with unique nonces/hashes and exactly one contract record each. Broadcast-boundary process death also recovered the same hash. Indefinite fee/drop recovery remains the declared BC-11 gap. |
| BC-13 | Covered (real RPC stop/restart) | `npm run verify:day4 -- --working-tree` | Passed two real HTTP task creations and durable enqueue during stopped RPC; persisted local chain state survives restart. Only the precise fresh-owner projection-delay response is retried. |
| BC-14 | Covered (real bounded retry) | `npm run verify:day4 -- --working-tree` | Passed an actual failing row through deployed workers to `dead_letter` at exactly five failures; known hashes continue receipt reconciliation without unbounded rebroadcast. An audited replay command is not claimed. |
| BC-15 | Covered | `npm run test -w @todo/todo-service -- signer-key-provider.test.ts` | `SecureSignerKeyProvider` with runtime in-memory protection, address validation, and logger redaction. |
| BC-16 | Covered (local comparison and public sample) | `cd contracts/onchain; npm run test:gas`; operator-run `npm run demo:sepolia` | Local append used 75,583 gas with 1 and 1,000 existing records; the Sepolia v1 synthetic demo write used 91,881 gas. |
| BC-17 | Covered | `npm run test -w @todo/todo-service -- backend-chain-integration.test.ts` | Independent Hardhat project exports `task-history.abi.json` and `task-history.deployment.json`; consumed dynamically by backend without hardcoded addresses. |
| OP-1 | Covered (chain copy) | `npm run rebuild:chain-projection` | Two consecutive live rebuilds passed with both current indexer processes and both Todo API replicas remaining running. Per-cycle advisory locking serializes scanners and rebuilds without manual database edits or stopping indexers. |
| OP-4 | Covered (operator-reported restore and smoke test) | Operator-run `pg_dump -Fc` and `pg_restore --no-owner` into scratch databases; authenticated API/TODO-read smoke test against the restored copies; evidence in `docs/operations.md` | Restore is manually demonstrated and timed; backups and scratch DBs remain local/private. |
| OP-7 | Covered | `npm run verify:mail` and `verify-mail-mode.mjs` | Mail destination switches between sink and external mode in Account PostgreSQL without redeploy, records an operator audit identity, and keeps sink as the default. |
| EV-9 | Covered (schema reversals) | `npm run verify:evolution:schema` with dedicated `EV_DATABASE_URL` | PostgreSQL 17 run passed all 19 Account + 26 Todo migrations up/down (45 total after two remediation migrations), catalog restoration, surviving core data, guarded rollback refusal and scratch DB/role cleanup. Discovery is dynamic. |
| EV-11 | Covered (real compatible-contract replacement) | `npm run verify:day4 -- --working-tree` | Passed two actual deployments, writes through the production submission worker, real log rebuild through production indexer/repository, and direct old/new history/timestamp read-back. The self-mapped fixture was removed. ABI-changing replacement is omitted. |
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

| Requirement | Supporting check actually run | Remaining requirement gap |
|---|---|---|
| BC-11 | `verify:day4` killed a real writer after actual broadcast and restarted writers confirmed the original durable hash exactly once. | Automatic fee replacement, audited replay and unconditional terminality for indefinitely dropped/stuck transactions are not built. State names alone are not proof. |
| EV-1 / EV-2 | `verify:evolution:schema` passed PostgreSQL 17 with frozen previous production GET repository HTTP reads before/during/after real production DDL. PostgreSQL locks verified overlapping requests. | This is not the full authenticated historical service or old-version write traffic. No blanket previous-path coverage is claimed. |
| EV-10 | Real schema down/up, compatible surviving core data and previous-repository read-back without restore; guarded incompatible workflow rollback refused safely. | Not every historical service release was deployed/rolled back. Foundational table drops intentionally remove their data. |
| PF-7 | Real RPC stop/restart and five-second worker RPC deadlines. | Slow chain and mail-provider capacity saturation is not fully measured; a mocked enqueue timing check was withdrawn. |

The on-chain contract has a local build, eight passing tests, ABI and deployment metadata export,
a reported chain-31337 Ignition deployment, a verified Sepolia deployment and synthetic read-back,
a local projection indexer with rebuild, deduplication, reorg rollback, and confirmation gating
(BC-3, BC-5..BC-9, OP-1), backend durable anchoring with privacy gate (BC-1, BC-2), asynchronous
submission code with state machine, multi-worker nonce coordination, and DLQ (BC-10..BC-14), signer
key custody (BC-15), gas measurements (BC-16), deployment artifact verification (BC-17), and RPC
isolation (PF-7). Default Compose now includes two chain writers and two indexers.
Public API-to-Sepolia anchoring, automatic fee replacement and audited operator recovery are
not demonstrated. EV-8's live rollout evidence is recorded
above and must not be confused with automated compatibility coverage for every event pair.

Account and Todo migrations were reconciled and completed on 2026-10-02; rerun the deployed
account-erasure verifier against the reconciled schema before claiming full DG-10. Public chain
history remains immutable and opaque.

## Requested Day 4 gate status

This table records the requested groups explicitly. “Documented” means the current behavior or
gap is described; it does not imply automated proof. Requirements remain partial where their
stated acceptance evidence is missing.

| Requirement | Current status | Evidence and remaining gap |
|---|---|---|
| PR-1 | Open | This traceability file is not yet an exhaustive one-row-per-requirement executable-check map. The completed table above and this status table are selective. |
| PR-2 | Partial | Shared contracts and the registration compatibility test provide independent producer/consumer evidence; independent contracts are not exercised for every event pair. |
| PR-3 | Partial | Registration v1/v2 compatibility is tested. A complete producer/consumer compatibility matrix is not automated. |
| PR-4 | Partial | `npm run verify:mail` exercises a Mailpit outage/recovery in an isolated project. Equivalent stop/restart automation for other dependencies and workflow processes remains open. |
| PR-5 | Partial | `scripts/verify-day4.mjs` assigns a unique Compose project, scopes volume cleanup, installs locked dependencies, and injects test-only secrets/configuration. The remediation working-tree run passed unit/E2E, real migration/chain and repeated live rebuild checks, then failed the existing owner-event replay SQL audit (`42P08`); no aggregate or committed clean-clone success is claimed. See `docs/day-4-verification-baseline.md`. |
| PR-6 | Partial | API endpoint/heading checks, authorization checks, and capacity checks exist. Status-code and all requested documentation behavior claims are not verified. |
| PR-7 | Partial | The mail verifier isolates its disposable Compose project. The full Day 4 suite is not demonstrated repeatable/safe in a clean clone. |
| PR-8 | Open | No record of eight deliberate breakages with observed detections and cleanup is present. |
| DOC-10 | Documented, not fully verified | API, architecture, event, and operations docs describe current ownership and behavior. No complete content verifier exists. |
| DOC-11 | Documented, partial | The legacy registration response and current response shape are documented and regression-tested; full v1 API lifecycle/sunset coverage is not established. |
| DOC-12 | Partial | `docs/api.md` documents responses, but `scripts/verify-api-docs.mjs` checks endpoint strings/headings, not every success/error status code. |
| OP-2 | Partial (live rehearsal pending) | `npm run ops:dlq -- inspect|replay ...`; eight focused DLQ tests pass | Three allow-listed DLQs, redacted inspection, exact 1,000-message cap, retry-header reset, confirmation-before-ack, and durable per-event replay audit are implemented. |
| OP-3 | Covered (operator-run) | `replay-event.mjs --from ... --to ... --target todo-history --apply` on 2026-10-03 | The range selected 14 events; nine were publisher-confirmed to the dedicated history queue and five were skipped as already processed. Other consumer targets are not needed for this requirement. |
| OP-3 additional target | Partial (live rehearsal pending) | Account `scripts/replay-owner-events.test.mjs`; ten focused tests pass | Bounded Account-source owner replay publishes only to the owner queue, checks actual consumer receipts/deletion tombstones, and records per-event outcomes in Account `owner_event_replay_audit`. |
| OP-6 | Covered (operator-run progress evidence) | `npm run ops:progress -w @todo/todo-service` after `npm run rebuild:chain-projection` on 2026-10-03 | Six queues each reported `ready=0`, `unacknowledged=0`, and `consumers=2`; chain 31337 reported latest block 2, safe head/checkpoint block 1, and zero lag. |
| OP-8 | Partial (isolated database boundary enforced) | `scripts/verify-operator-access.mjs` passed on fresh Account/Todo scratch databases on 2026-10-03; `scripts/operator-access.test.mjs` | Real restricted-login CLI operations and denied direct table access are proven; break-glass open/close audit is append-only. The operator chose not to apply live migrations or provision live identities. Non-Docker coverage for remaining tasks is a deployment gap; see `docs/operations-access.md`. |
| OP-9 | Covered (mechanical rollback rehearsal) | `npm run test:operations`; `npm run verify:rollback` passed on 2026-10-03 | All three replicas switched retained image references; deliberately failed health restored and verified all current replicas. The same-build two-tag rehearsal is not historical-release/schema compatibility proof. Database and public chain are unchanged. |
| OP-10 | Partial | `npm run verify:day4` (clean-clone/repeated run pending) | Verifier now isolates Compose resources and generates test-only configuration; not every documented command has been verified on a clean clone. |
| EVT-8..EVT-10 | Documented, partial | `docs/events.md` contains version/consumer matrix and evolution rules. Compatibility automation covers registration, not all producer/consumer pairs. |
| EVT-11 | Documented, partial | The event catalogue describes current event families and consumers; exhaustive schema-to-document verification is absent. |
| EVT-12 | Documented | Email triggers, content/recipient, and sink/external destination are listed in `docs/events.md`; external provider refusal remains untested. |
| ARC-8 | Partial | Membership projection ownership and propagation are documented; full propagation latency evidence is not recorded. |
| ARC-9 | Documented | The durable workspace-provisioning saga, participant boundaries, compensation, and failure behavior are described in `docs/architecture.md` and `docs/distributed-workflow.md`; some DB/HTTP assertions remain open. |
| ARC-10 | Documented | Replica topology and shared-state responsibilities are recorded in `docs/architecture.md` and `docs/capacity.md`; capacity evidence is scoped to the checks listed above. |
| ARC-11 | Documented, partial | Contract finality, confirmation depth, and reorg projection behavior are documented/tested locally; default Compose deploys chain workers, but public application-pipeline proof remains unproven. |
| AUT-2..AUT-5 | Covered | `npm run verify:authorization` plus the cited live E2E checks in the completed evidence table. |
| ONC-1..ONC-7 | Documented, partial | Contract behavior, privacy, deployment, reads, keys, and versioning are described in `docs/onchain.md`; backend production anchoring and operator recovery remain separate gaps. |
| OPS-1..OPS-6 | Partial | `docs/operations.md` has symptom-led runbooks. Chain-projection rebuild and notification replay are available; the new general DLQ, progress, and range-replay commands await runtime proof. |
| TRC-1..TRC-5 | Open | Requirement-to-check mapping and the supporting traceability workflow are not exhaustive; partial/operator-reported evidence is separated, but complete mappings and audit evidence remain. |

The grouped statuses above intentionally do not mark PR-1, PR-3, PR-4, PR-5, PR-6,
PR-7, PR-8, DOC-12, EVT-8..EVT-11, ARC-8, OPS-1..OPS-6, or TRC-1..TRC-5 as fully
complete. No missing check is inferred from documentation alone.

## Mail Status (Stage 7)

This status table includes manual and partial results; only rows explicitly marked covered are
complete. External delivery is operator-reported and is never exercised by automated tests.

| Requirement | Status | Evidence / check | Remaining gap |
|---|---|---|---|
| ML-1 | Manual delivery reported complete | On 2026-10-02 the operator reported receiving a Brevo password-reset email for a registered, operator-controlled inbox; the one-time token was accepted and confirmation returned HTTP 204. Recipient and token are intentionally omitted. | Keep the provider receipt redacted and outside the repository. |
| ML-2 | Operator-confirmed | Operator reports Brevo Free permits 300 messages per day and signup required only a personal email; no card or company domain was supplied. | Keep a redacted record of the plan and signup terms outside the repository. |
| ML-3 | Covered | `npm run test -w @todo/account-service -- src/notifications/__tests__/notification.mailer.test.ts src/notifications/__tests__/notification.external.test.ts`; live `verify-mail-mode.mjs`; operator reported successful sink and external reset flows. | Keep sink as the default and verify read-back after the trial. |
| ML-4 | Operator-confirmed | Unit tests cover mounted-file credentials and sanitized provider errors; external SMTP preflight succeeded; operator reports replacing the exposed SMTP key. | Keep the replacement key only in the local secret file and never commit it. |
| ML-5 | Partial | `npm run verify:mail` exercises Mailpit outage, retries, DLQ, and replay; originating operation remains asynchronous. | External provider refusal, throttling, and outage proof remain open. |
| ML-6 | Partial | Provider-neutral transport selector and provider adapter tests exist. | Live provider replacement without business-rule changes is not demonstrated. |
| ML-7 | Covered (mail path) | `docker compose run --build --rm --no-deps -T account-service node apps/account-service/scripts/verify-notification-quota.mjs` proves the shared five-per-24-hour quota and recipient/deletion fences; operator reset test used a registered account. | Re-run quota verification after any schema or mail-policy change. |
| ML-8 | Covered | `npm run verify:mail` forces sink-only configuration; mail unit tests mock Nodemailer. | Automated tests must continue to reject external transport. |

`npm run verify:mail` is the automated sink-only outage proof; it does not send
external mail. The Stage 6 external reset was a manual operator action, not an
automated test. Brevo's daily quota and the sender verification are operator-
reported, not independently verified by this repository.

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