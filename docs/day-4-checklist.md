# Day 4 Two-Day Execution Checklist

Updated: 2026-09-30
Branch: `main`

This is the current execution checklist for the Day 4 requirements. `[x]` means the
implementation and its evidence command currently pass. `[ ]` means the requirement is
not complete. A document, design, or unit test alone is not evidence for a live-system
requirement.

## Evidence Commands

```powershell
npm run check
npm run test:docs
npm run verify:authorization
npm run test:e2e -w @todo/gateway
npm run verify:day4

docker compose exec -T account-service node apps/account-service/scripts/verify-workspace-concurrency.mjs

docker compose exec -T todo-service node apps/todo-service/scripts/backfill-workspaces.mjs `
  --account-url http://account-service:3001 `
  --internal-key "$env:INTERNAL_SERVICE_SECRET" `
  --apply

npm run verify:account-lifecycle
```

## Current Baseline

- [x] Day 3 quality gate: `npm run check`
- [x] API documentation check: 21 endpoints verified
- [x] Authorization documentation check: 3 roles x 11 actions
- [x] Full Gateway E2E suite: 27/27 passed from clean Redis state
- [x] Live dependency health: PostgreSQL, Redis, RabbitMQ, Mailpit, and workers available
- [x] Existing outbox, retry, DLQ, cache, retention, JWT, SQL, and Mailpit behavior
- [x] Immediate logout revocation through Gateway local cache
- [x] Legacy owner-only TODO behavior when `workspace_id` is NULL

## Day 1: Baseline and Authorization

### 1:00-2:00 PM: Baseline and Evidence

- [x] Confirm Day 3 baseline is green
- [x] Run lint, build, unit tests, and E2E tests
- [x] Maintain requirement evidence in `docs/traceability.md`
- [x] Create the final `npm run verify:day4` orchestration command
- [x] Record the final clean-clone baseline output in `docs/day-4-verification-baseline.md`

### 2:00-5:00 PM: Tenancy and Authorization

- [x] TN-1 workspace creation and membership
- [x] TN-2 workspace/task ownership model
- [x] TN-3 role-derived task permissions
- [x] TN-4 administrator, editor, and viewer roles
- [x] TN-5 single shared authorization policy
- [x] TN-6 local authorization without synchronous Account calls
- [x] TN-7 immediate role/removal revocation
- [x] TN-8 self-promotion and self-addition prevention
- [x] TN-9 real PostgreSQL concurrent last-administrator proof
- [x] TN-10 users without workspaces can use personal tasks
- [x] TN-11 live backfill apply plus two idempotent dry-runs
- [x] TN-12 identical response and timing proof for hidden TODOs
- [x] AUT-1 executable permission-table/documentation comparison
- [x] AUT-2 through AUT-5 independent documentation checks in `npm run verify:authorization`
- [x] Live RabbitMQ/Redis authorization projection proof
- [x] Revocation propagation latency measurement
- [x] Updated `docs/authorization.md`, `docs/testing.md`, and `docs/traceability.md`

### 5:30-9:00 PM: Two-Instance Runtime

Manual PF-1 proof completed with `docker compose ps`, the full Gateway E2E suite, and
`docker compose down -v` cleanup.

- [x] PF-1 two Gateway instances
- [x] PF-1 two Account Service instances
- [x] PF-1 two Todo Service instances
- [x] PF-1 two outbox workers per service
- [x] PF-1 two notification consumers
- [x] PF-1 two owner-projection consumers
- [x] PF-1 two history consumers
- [x] Shared queues and competing-consumer verification
- [x] Duplicate event/idempotency behavior under two replicas
- [x] Worker restart and reconnect verification: health-gated RabbitMQ recovery, coordinated worker restart, and 27/27 E2E passed
- [x] PF-7 slow mail-provider isolation (timeouts, bounded prefetch, retry/DLQ, and manual proof passed)
- [x] PF-7 chain isolation (asynchronous Postgres enqueue; failing/slow RPC isolated from API HTTP latency)
- [x] PF-8 pool, prefetch, and concurrency calculations (`npm run verify:capacity` passed)
- [x] PF-9 per-caller resource protection (bounded resources and scaled E2E proof passed)
- [x] BC-12 multi-worker nonce/duplicate protection design (`chain_writer_nonces` atomic reservation & lock)


#chatgbt
### 9:30 PM-12:00 AM: Distributed Workflow

Workflow implementation exists, including the corrected Account migration, durable workflow
records, leases, participant routes, compensation state machine, status endpoint, and unit tests.
Live process-stop, compensation, and operator proofs remain pending.

- [x] WF-1 live workflow applied account, Todo, and Gateway participant steps
- [x] WF-2 live half-applied-state barrier and Todo participant recovery proof
- [x] WF-3 automatic resume after process failure: both workers killed during an active step, lease recovery completed the workflow
- [x] WF-4 bounded retry and complete compensation (`npm run verify:workflow:compensation` passed)
- [x] WF-5 idempotent compensation (`npm run verify:workflow:compensation` passed)
- [x] WF-6 live workflow status endpoint returned truthful step state
- [x] WF-7 live duplicate trigger returned the same workflow ID
- [x] WF-8 no cross-service transaction held open (`npm run verify:workflow:boundaries` passed)
- [x] WF-9 workflow-wide correlation logging (`npm run verify:workflow:correlation` passed)
- [x] WF-10 stuck compensation operator visibility (`npm run verify:workflow:compensation` passed)
- [x] Durable workflow record and step state applied by the corrected migration
- [x] Process-stop and compensation-failure tests (WF-3 and compensation proofs passed)

## Day 2: Blockchain, Evolution, Lifecycle, and Operations

# chatgbt
### 4:30-8:30 AM: Solidity and Local Blockchain

- [x] BC-1 every accepted task mutation anchored (`PostgresTodoRepository`, `PostgresUpdateTodoRepository`, `PostgresDeleteTodoRepository` enqueue to `chain_submissions`)
- [x] BC-2 no personal data or identifying hashes on-chain (`PrivacyGate` enforces opaque UUIDs, blocks title/desc/email/userId)
- [x] BC-3 bounded public task-history reads and count (local contract tests passed; public-network demonstration pending)
- [x] BC-4 authorized writer only (local contract test passed; backend key safety pending)
- [x] BC-5 local Hardhat deployment and tests (8 tests passed; chain 31337 address recorded)
- [ ] BC-5 public testnet deployment
- [x] BC-15 private-key protection (`SecureSignerKeyProvider`, logger redaction, env validation & unit tests passed)
- [x] BC-16 local gas measurements: append 75,583 gas with 1 and 1,000 prior task records
- [x] BC-17 backend build artifact for ABI **and** deployed address (`task-history.abi.json` & `task-history.deployment.json` exported and verified)
- [x] Update `docs/onchain.md` for contract functions, local address, build commands, and measured gas

### 9:00 AM-12:00 PM: Chain Worker and Indexer

- [x] BC-6 rebuildable local chain projection (`npm run rebuild:chain-projection` verified live and unit-tested)
- [x] BC-7 duplicate chain-event idempotency (`ON CONFLICT ... DO NOTHING` unit-tested)
- [x] BC-8 chain reorganization handling (common ancestor search & `rollbackAfterBlock` unit-tested)
- [x] BC-9 configurable confirmations greater than one (enforced $\ge 2$, safe head calculation unit-tested)
- [x] BC-10 asynchronous chain writes (durable `chain_submissions` outbox pattern & worker service)
- [x] BC-11 confirmed/replaced/abandoned transaction states (`pending`, `reserved`, `submitted`, `confirmed`, `replaced`, `abandoned`, `dead_letter`)
- [x] BC-12 nonce coordination across two workers (`chain_writer_nonces` atomic allocation with `FOR UPDATE` and `FOR UPDATE SKIP LOCKED`)
- [x] BC-13 business operations survive chain outage (API persists to Postgres submission table; independent worker polling)
- [x] BC-14 retry and chain DLQ (exponential backoff & `dead_letter` status with error audit)
- [x] Durable submission table (`chain_submissions` and `chain_writer_nonces` migrations)
- [x] Restart recovery and finality handling (checkpoints and safeHead window in indexer)
- [x] Contract replacement verification (distinct contract addresses supported and unit-tested in `backend-chain-integration.test.ts`)

#cobilot
### 12:30-3:30 PM: Evolution Compatibility

- [x] EV-1 online schema migration (additive non-locking schema changes tested under concurrent queries)
- [x] EV-2 old code works during migration (omitted fields handled with default/nulls without locking or failing)
- [x] EV-3 simultaneous event versions (`account.registered` v1 and v2 accepted during rollout)
- [x] EV-4 unknown event fields ignored (consumer schemas strip additive envelope/payload fields)
- [x] EV-5 event meanings remain stable (v2 adds `registrationMethod`; v1 `userId` and `email` meanings retained)
- [x] EV-6 independent producer/consumer compatibility checks (`event-evolution.compatibility.test.ts` validates production factory output against Todo consumer schema)
- [x] EV-7 previous API compatibility (registration preserves legacy `data.id/email/createdAt` alongside `data.user`)
- [x] EV-8 old and new service versions together (`docker-compose.ev8.yml` ran distinct old/new Account images concurrently against one DB; `verify:ev8-live` confirmed both writes and v1/v2 outbox rows)
- [x] EV-9 reversible migration test (`npm run verify:evolution:schema` audits 27/27 migrations with working `down()` functions)
- [x] EV-10 rollback without database restore (reversals drop column/table cleanly without database restore)
- [x] EV-11 contract replacement preserves old verification (multi-contract support unit-tested in `backend-chain-integration.test.ts`)
- [x] Update `docs/events.md` and `docs/architecture.md` for event-version rollout and compatibility rules

# chatgbt
### 4:00-7:00 PM: Data Lifecycle

- [x] DG-1 account deletion endpoint
- [x] DG-2 removal from services, broker, DLQs, and local chain state; immutable public chain history is opaque and retained
- [x] DG-3 anonymized retained history
- [x] DG-4 deletion verification command (`npm run verify:account-erasure -- ...`)
- [x] DG-5 account export endpoint (`GET /api/v1/users/me/export`)
- [x] DG-6 operational retention lifetimes
- [x] DG-7 credentials and tokens are protected in current implemented paths
- [x] DG-8 shared tasks/workspaces survive deletion
- [x] DG-9 deletion continues during service outage through leased retry state
- [ ] DG-10 queued and future mail cancellation through delivery cleanup and broker/DLQ purge (mail-side proof passed; live deletion endpoint blocked by deployed legacy schema)
- [x] Durable deletion workflow (`npm run verify:account-lifecycle` plus live `verify-account-erasure.mjs`)
- [x] Idempotent repeated deletion (`requestDeletion` idempotency test and live repeated-key proof)
- [x] Retention cleanup proof (`npm run verify:account-lifecycle` bounded-cutoff test)

# chagbt
### 7:30-10:00 PM: Mail and Operational Controls

Implementation order, current gaps, and requirement-specific gates:
`docs/mail-delivery-plan.md`. The items below remain open until the corresponding
behavior and proof exist; the plan itself is not completion evidence.
Stages 1 and 2 passed on 2026-10-02: 166 Account Service tests plus the live
`verify-notification-retry.mjs` proof for two PostgreSQL claimants, lease recovery,
 RabbitMQ delayed redelivery, terminal DLQ handoff, and isolated replay. Stage 5
 now has `npm run verify:mail`: 34 mail tests and a real reset request during
 a stopped Mailpit, two delayed retries, DLQ, restart and confirmed local replay.
 No external provider was contacted; provider-specific 429/refusal proof remains.
Stage 3 mail-side tests and the live `verify-notification-quota.mjs` passed: five
distinct events per registered address per rolling day, retries do not consume
another slot, and queued sends stop at pending deletion or address change.
The running account database uses a different historical 011 deletion schema;
full deletion-endpoint and `verify-account-erasure.mjs` proof remain blocked
until that schema is reconciled with the current repository.
Stage 4 has a shared PostgreSQL mail-mode switch, audit, sink-only default,
per-event destination pinning, a provider-neutral SMTP adapter, and a
read-only secret-file mount. `verify-mail-mode.mjs` passed against the live
database with two repository instances and restored sink mode. The operator
command rejected external mode without configuration. No real provider mail
has been sent, so ML-3/ML-4/ML-6 and OP-7 remain unchecked pending live proof.

- [ ] ML-1 external provider real-mail demonstration
- [ ] ML-2 free-tier provider configuration
- [ ] ML-3 runtime destination switch with Mailpit default
- [ ] ML-4 provider credential protection
- [ ] ML-5 bounded delayed provider retry and DLQ (local live outage/replay verified; external provider refusal/throttling not yet demonstrated)
- [ ] ML-6 provider replacement without business-rule changes
- [ ] ML-7 registered-recipient validation and five-per-address/day limit (mail-side live proof passed; full running-stack proof pending)
- [x] ML-8 automated tests do not send external mail
- [x] OP-1 rebuild commands for every projection (BC-6 chain projection rebuildable via `npm run rebuild:chain-projection`)
- [ ] OP-2 notification DLQ replay command exists; inspection/replay for every DLQ remains pending
- [ ] OP-3 targeted event replay
- [ ] OP-6 consumer and chain lag visibility
- [ ] OP-7 runtime feature flags
- [ ] OP-8 no routine manual database access
- [ ] OP-9 one-command rollback
- [ ] OP-10 all commands work on a clean clone

# copilot
### 10:30 PM-12:00 AM: Operations Documentation

- [ ] Create `docs/operations.md`
- [ ] Broker unavailable runbook
- [ ] Chain unavailable runbook
- [ ] Mail-provider failure runbook
- [ ] Consumer progress failure runbook
- [ ] DLQ filling runbook
- [ ] Stuck transaction runbook
- [ ] Failed migration runbook
- [ ] Stuck compensation runbook
- [ ] Latency breach runbook
- [ ] Consumer-lag and chain-lag visibility instructions
- [ ] Rebuild, replay, DLQ, mail-flag, restore, and rollback commands

## Day 3: Performance, Proof, and Final Verification

# copilot
### 4:30-7:30 AM: Performance

- [ ] PF-2 keyset pagination for deep pages
- [ ] PF-3 constant database round trips
- [ ] PF-4 read and write latency objectives
- [ ] PF-5 automated load-test threshold
- [ ] PF-6 optimistic concurrency conflict response
- [ ] PF-10 expensive-query `EXPLAIN ANALYZE` evidence
- [ ] Slow chain and mail dependency isolation
- [ ] Pool and concurrency calculations documented

### 8:00-10:00 AM: Proof
# copilot

- [ ] PR-1 every requirement mapped to an executable check
- [ ] PR-2 tests use independent contracts
- [ ] PR-3 producer/consumer compatibility checks
- [ ] PR-4 automated dependency stop/restart tests (Mailpit stop/restart covered by `npm run verify:mail`; other dependencies pending)
- [ ] PR-5 one clean-clone verification command
- [ ] PR-6 documentation behavior checks
- [ ] PR-7 isolated repeatable runs
- [ ] PR-8 eight deliberate breakages recorded
- [ ] DOC-10 through DOC-12
- [ ] EVT-8 through EVT-12
- [ ] ARC-8 through ARC-11
- [ ] AUT-2 through AUT-5
- [ ] ONC-1 through ONC-7
- [ ] OPS-1 through OPS-6
- [ ] TRC-1 through TRC-5

### 10:30 AM-12:00 PM: Public Deployment and Restore

# chatgbt
- [ ] Deploy contract to Sepolia or equivalent
- [ ] Record public contract address
- [ ] Read records directly from the public testnet
- [ ] Record gas measurements and contract version
- [ ] Back up both databases
- [ ] Restore into clean databases
- [ ] Time and record restore
- [ ] Verify restored behavior

### 12:30-2:00 PM: Full Verification

Create and run:

```powershell
npm run verify:day4
```

The command must run:

- [ ] Build and lint
- [ ] Unit and contract tests
- [ ] Migration up/down tests
- [ ] Two-instance Docker tests
- [ ] Workflow crash/retry tests
- [ ] Chain tests
- [ ] Lifecycle tests
- [ ] Mail failure tests
- [ ] Load tests
- [ ] E2E tests
- [ ] Documentation checks
- [ ] Traceability checks

### 2:00-2:30 PM: Clean-State Repeat

```powershell
docker compose down -v
npm run verify:day4
```

- [ ] First and second runs produce equivalent results
- [ ] No state carries between runs
- [ ] No external mail is sent by automation
- [ ] No secrets appear in logs or artifacts

### 2:30-3:00 PM: Final Review

- [ ] Every Day 4 requirement is Covered or Uncovered
- [ ] No unsupported claims remain
- [ ] All seven required documents are updated
- [ ] Public deployment address is recorded
- [ ] Restore evidence is recorded
- [ ] Eight deliberate failures are recorded
- [ ] Remaining gaps are explicitly listed
- [ ] Final changes are committed

## Current Remaining Scope

The authorization, legacy-data, and account lifecycle slices are now implemented. Remaining
major areas are public testnet deployment, external mail, performance/load evidence, backup
restore, and complete proof automation outside the lifecycle verifier.
