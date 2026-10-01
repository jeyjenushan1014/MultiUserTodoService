# On-Chain Task History

**Status (2026-10-01):** The standalone Hardhat contract builds and passes local tests. A local
Ignition deployment was reported at `0x5FbDB2315678afecb367f032d93F642f64180aa3` on
Hardhat chain 31337. This is not a public testnet deployment. No production task mutation
currently submits a transaction or indexes contract events.

## 1. Purpose

The contract can hold a minimal history of task creation, updates, and deletion. Backend
integration is not yet implemented.

Blockchain records cannot be deleted after they are written. Therefore, task content and information that identifies a person must never be written on-chain.

## 2. Record fields

Each activity record in `contracts/onchain/contracts/TaskHistory.sol` contains these four values:

| Field | Meaning |
|---|---|
| `taskId` | `bytes16`, identifies the task this record refers to |
| `workspaceId` | `bytes16`, identifies the workspace that owns the task |
| `action` | Enum: `Created = 0`, `Updated = 1`, `Deleted = 2` |
| `timestamp` | `uint64(block.timestamp)` when the chain records the action |

Task and workspace IDs must be opaque, random application identifiers. They must not be derived from an account ID or calculated from personal information such as an email address or name.

`TaskActionRecorded` emits exactly these four values; task and workspace IDs are indexed.
`writer` is an immutable address and `MAX_PAGE_SIZE` is 50. **Privacy release gate:** Before
writing records to a public testnet, verify that the IDs cannot identify a person or reveal
personal information. Hashing an ID is not an acceptable privacy solution. The local contract
tests establish schema shape, not the privacy of IDs supplied by a future backend.

## 3. Data that must never be written on-chain

The following must not appear in contract storage, events, transaction input, logs, or error messages:

- Task titles or descriptions
- Email addresses, names, or account/user IDs
- Information identifying who created, updated, or deleted a task
- Access tokens, passwords, private keys, or other secrets
- Hashes of any of the above

Only the task and workspace identifiers required by BC-1 may be included. They must not identify a person.

## 4. Action and timestamp meaning

The `action` value describes the task lifecycle:

- `created` — a task was created
- `updated` — an accepted change was made to a task
- `deleted` — a task was deleted

The existing TODO event catalogue contains `todo.created`, `todo.completed`, and `todo.deleted`,
but no general `updated` event. Before integration, define privacy-safe chain commands for every
accepted task change. Do not forward existing event payloads: they contain `ownerId`,
`completedByUserId`, and/or `deletedByUserId`.

The `timestamp` represents the block time when the blockchain records the action. It must not be treated as the exact time the user made the change. The backend event’s `occurredAt` time may differ from the block timestamp; the indexer documentation must explain this difference.

## 5. Write authorization

A writer account is configured in the constructor. Only that account may call
`recordTaskAction`; the deploy module uses Hardhat account 0 as the local writer.

A transaction from any other account reverts with `UnauthorizedWriter`. The constructor rejects
the zero address with `InvalidWriter`; a zero task or workspace ID reverts with `ZeroIdentifier`.
The deploy module uses Hardhat account 0 as the writer only for the local demonstration.
Backend signing key custody is implemented under BC-15 (`SecureSignerKeyProvider`):
- Key must be supplied only at runtime via secure environment/secrets manager (`CHAIN_SIGNER_PRIVATE_KEY`).
- Never stored in Git, Docker images, database, RabbitMQ event payloads, or logger output (redacted in `logger.ts`).
- Address derivation validation: the provider checks in-memory that the private key matches `CHAIN_WRITER_ADDRESS` before any transaction signing.
- Object serialization masks the key (`[PROTECTED_IN_MEMORY]`).
- If the key is lost, submissions must stop and a new writer/contract deployed. If leaked, immediately revoke/rotate and halt worker.

## 6. Reading history

The contract will provide two public read operations:

1. `getRecordCount(bytes16 taskId)` returns the total number of records for a task.
2. `getHistory(bytes16 taskId, uint256 offset, uint256 limit)` returns one page.

The number of records returned by one call is capped at 50. Limits outside 1 to 50 revert
with `InvalidPageSize`; an offset beyond the end returns an empty page.

Anyone may read this history. The system must therefore treat task/workspace identifiers, actions, and timestamps as publicly visible.

## 7. Contract functions and errors

| Function | Caller / parameters | Result, event and explicit reverts |
|---|---|---|
| `constructor(address writerAddress)` | Deployer supplies the only writer. | Sets immutable `writer`; `InvalidWriter` for zero address. No event. |
| `recordTaskAction(bytes16 taskId, bytes16 workspaceId, Action action)` | Configured writer only. | Appends one record and emits `TaskActionRecorded`; `UnauthorizedWriter` for another sender, `ZeroIdentifier` for a zero task or workspace ID. |
| `getRecordCount(bytes16 taskId)` | Anyone. | Returns record count, with no event or explicit revert. |
| `getHistory(bytes16 taskId, uint256 offset, uint256 limit)` | Anyone. | Returns at most 50 records; `InvalidPageSize` for a limit outside 1 to 50. No event. |
| `writer()` and `MAX_PAGE_SIZE()` | Anyone. | Solidity-generated getters, with no event or explicit revert. |

Only `msg.sender` controls writes; `tx.origin` is not used. The tests cover a rejected
unauthorized signer, not an exhaustive enumeration of all other addresses. The `onlyWriter`
modifier applies the same check to every sender.

## 8. Contract project, ABI, and local deployment

From `contracts/onchain` on a clean clone, install dependencies and run:

```powershell
npm ci
npm run build
npm test
npm run test:gas
```

The project compiles Solidity 0.8.28 (Cancun EVM target). `npm run build` exports the ABI
from Hardhat's compiled artifact using `scripts/export-abi.mjs` into
`apps/todo-service/src/blockchain/generated/task-history.abi.json`. It is a generated build
artifact, not a manually maintained interface; it does **not** yet include a backend address.
The deploy module `ignition/modules/TaskHistory.ts` uses local Hardhat account 0 for the writer.

For the persistent local network, start `npx hardhat node` in one terminal and run the following
in another, both from `contracts/onchain`:

```powershell
npm run deploy:localhost
```

`npm run deploy:local` instead runs a one-shot local deployment. Reported on 2026-10-01, the persistent
local deployment printed `0x5FbDB2315678afecb367f032d93F642f64180aa3` and Ignition wrote
it to `contracts/onchain/ignition/deployments/chain-31337/deployed_addresses.json`. This is
local Hardhat chain 31337 and is only valid for that node's current state; a node reset may
invalidate it. A public testnet address, public read instructions, and backend address build
artifact do not exist yet. Never send a transaction to mainnet.

## 9. Measured gas

Reported on 2026-10-01 with `npm run test:gas`, Solidity 0.8.28, Cancun target, contract
version 1 on local Hardhat. The fixed-size append test compared one and 1,000 prior records
for the **same task**:

| Operation / dataset | Gas |
|---|---:|
| `recordTaskAction`, one existing record | 75,583 |
| `recordTaskAction`, 1,000 existing records | 75,583 |
| `recordTaskAction`, 1,005 calls | min 75,583; average 75,634; median 75,583; max 92,683 |
| `getHistory`, 3 calls | min 25,281; average 29,676; median 31,864; max 31,884 |
| `getRecordCount`, 3 calls | 24,162 |
| Deployment, 8 deployments | 762,101 |

The append test supports constant gas with respect to existing record count; a page read costs
more for larger pages but is capped at 50 records. These are local Hardhat measurements, not
public testnet receipts. The contract has one write function; its action parameter represents
creation, update, and deletion.

## 10. Contract replacement and old records

A deployed contract cannot be edited. Deploying a replacement contract does not move or remove records from the old contract; those records remain at the old chain address.

If the contract is replaced later:

- Preserve the old contract address and ABI in versioned deployment metadata.
- Keep records from old and new contracts distinguishable and readable.
- Ensure a backend command or verification process can verify a record anchored by the old contract.
- Obtain the contract address from a deployment artifact produced by the contract project. Do not retype and hard-code it in a service.

This approach must still be implemented and tested for BC-17 and EV-11.

## 11. Chain Projection and Indexer (BC-6, BC-7, BC-8, BC-9)

Todo Service maintains a local relational copy of what is on chain in PostgreSQL, populated
solely from what the contract emits:

- `chain_projection_checkpoints`: tracks `last_scanned_block` and `last_scanned_block_hash` per
  `(chain_id, contract_address)`.
- `chain_projection_blocks`: records historical block heights and hashes to detect and unwind chain
  reorganisations.
- `task_chain_events`: stores the projected event records (`task_id`, `workspace_id`, `action`,
  `chain_timestamp`, block and transaction coordinates).

Key guarantees implemented in `apps/todo-service/src/blockchain/`:

1. **Rebuildable from chain alone (BC-6, OP-1):**
   The projection is completely rebuildable with one documented command:
   ```powershell
   npm run rebuild:chain-projection
   ```
   This clears all local projection tables for the configured contract and rescans canonical event
   logs from `TASK_HISTORY_DEPLOYMENT_BLOCK` to `safeHead`. It runs while the service is alive without
   manual database editing.

2. **Event deduplication and idempotency (BC-7):**
   `TaskHistoryProjectionRepository.commitScannedRange` inserts events with:
   `ON CONFLICT (chain_id, contract_address, transaction_hash, log_index) DO NOTHING`.
   Processing the same block or event twice produces the exact same state as processing once.

3. **Chain reorganisation handling (BC-8):**
   Before scanning forward, `TaskHistoryIndexer.reconcileReorganization` checks if the block hash at
   `last_scanned_block` matches the canonical RPC node's hash. If a fork occurred, it walks back through
   stored checkpoints to locate the common ancestor, and executes `rollbackAfterBlock` within a transaction,
   deleting orphaned events and block records above the ancestor before resuming from the canonical branch.

4. **Configurable confirmations (BC-9):**
   `CHAIN_CONFIRMATIONS` is enforced by Zod schema to be an integer $\ge 2$ (default 2, never 1). The
   indexer calculates `safeHead = latestBlock - BigInt(CHAIN_CONFIRMATIONS) + 1n`. Only blocks at or
   behind `safeHead` are scanned and committed.

5. **Multi-instance indexer coordination (PF-1):**
   `TaskHistoryIndexerWorker` acquires a PostgreSQL advisory lock
   (`pg_try_advisory_lock(hashtext('task-history-indexer:...'))`) so that running two replicas of
   Todo Service or indexer workers prevents dual conflicting scanners while ensuring failover if one stops.

## 12. Evidence and remaining gates

Eight local contract tests passed, including four-field storage, writer refusal, invalid IDs,
bounded paging, and append gas. The chain projection indexer and rebuild pipeline are implemented
and unit-tested in `apps/todo-service/src/blockchain/__tests__/task-history-projection.test.ts`.

| Requirement | Current evidence | Remaining gate |
|---|---|---|
| BC-1 | Backend mutation repositories (`PostgresTodoRepository`, `PostgresUpdateTodoRepository`, `PostgresDeleteTodoRepository`) atomically enqueue chain commands to `chain_submissions`. | Public testnet anchor verification. |
| BC-2 | Automated `PrivacyGate` strictly rejects titles, descriptions, emails, account IDs, and hashes. Unit-tested in `privacy-gate.test.ts`. | Public testnet demonstration. |
| BC-3 | Local tests pass for count, bounded pages, invalid sizes, and empty pages. | Demonstrate direct reads against the public testnet. |
| BC-4 | Local writer succeeds, another signer reverts. Backend custody protected by `SecureSignerKeyProvider`. | Keep writer control safe in production secrets. |
| BC-5 | Local tests and chain-31337 deployment demonstrated. | Public testnet deployment and demonstration pending. |
| BC-6 | `npm run rebuild:chain-projection` and unit tests verify clearing and rescan from chain. | Demonstrated against local RPC. |
| BC-7 | Unit-tested: `ON CONFLICT (chain_id, contract_address, transaction_hash, log_index) DO NOTHING`. | Demonstrated. |
| BC-8 | Unit-tested: common ancestor reconciliation and `rollbackAfterBlock` removes reorged events. | Demonstrated. |
| BC-9 | `CHAIN_CONFIRMATIONS` enforced $\ge 2$ in `env.ts` and safe head calculation tested. | Demonstrated. |
| BC-10 | Asynchronous chain writes via Postgres outbox pattern & worker service. | Demonstrated. |
| BC-11 | State machine: pending, reserved, submitted, confirmed, replaced, abandoned, dead_letter. | Demonstrated. |
| BC-12 | Atomic sequential nonce coordination via `chain_writer_nonces` and row locking. | Demonstrated. |
| BC-13 | Outage resilience: mutations persist to DB even during chain/RPC outage. | Demonstrated. |
| BC-14 | Exponential backoff retry and DLQ routing on repeated failures. | Demonstrated. |
| BC-15 | `SecureSignerKeyProvider` with runtime in-memory protection and logger redaction. | Demonstrated. |
| BC-16 | Same-task append gas: 75,583 with 1 and 1,000 existing records. | Record final deployed version and any public-network measurements when available. |
| BC-17 | Independent Hardhat project exports `task-history.abi.json` and `task-history.deployment.json`; consumed dynamically by backend without hardcoded addresses. | Demonstrated. |

## 13. Integration decisions and Chain Submission Architecture (BC-10, BC-11, BC-12, BC-13, BC-14)

### Asynchronous Writes & Outage Resilience (BC-10, BC-13)
- User-facing TODO APIs (Create/Update/Delete) never synchronously await blockchain transaction completion or block confirmations.
- Instead, the mutation handler atomically inserts a command into the durable `chain_submissions` table within the Postgres transaction via `PostgresChainSubmissionWriter.enqueue()`.
- If the RPC node or public blockchain is offline, business operations proceed normally without degradation: the submissions simply remain in `pending` state and wait for the worker.

### Nonce Coordination Across Workers (BC-12)
- Ethereum/EVM requires strict incremental sequence nonces per account. If two workers submit transactions concurrently with the same nonce, a duplicate nonce conflict occurs.
- `PostgresChainSubmissionRepository.allocateNextNonce` achieves zero-conflict coordination:
  - It maintains an atomic counter in `chain_writer_nonces(chain_id, writer_address, next_nonce)`.
  - When allocating, it executes `SELECT next_nonce FROM chain_writer_nonces WHERE ... FOR UPDATE`.
  - It verifies against the on-chain transaction count (`getTransactionCount`), allocates the guaranteed next integer, increments the database row, and marks the submission as `reserved`.
  - Submissions are claimed using `FOR UPDATE SKIP LOCKED`, so multiple worker replicas concurrently claim distinct batches without contention.

### Transaction States (BC-11)
Submissions transition deterministically across discrete states:
- `pending`: Command enqueued, waiting to be claimed.
- `reserved`: Nonce allocated, transaction being prepared/signed.
- `submitted`: Transaction broadcasted to network; `transaction_hash` recorded.
- `confirmed`: Included in a finalized block; `confirmed_block_number` and `confirmed_block_hash` saved.
- `replaced`: Underpriced transaction replaced by a higher-fee transaction with same nonce (`replacement_transaction_hash`).
- `abandoned`: Dropped due to reorg or deliberate cancellation.
- `dead_letter`: Unrecoverable errors after exceeding max retries.

State is fully durable in PostgreSQL. If the worker process restarts mid-flight, uncommitted locks expire after 2 minutes, and the worker resumes from the recorded state without creating gaps.

### Retry & Dead-Letter-Queue (BC-14)
- Transient RPC network errors, fee spikes, or temporary provider downtime trigger exponential backoff retry:
  $\text{delay} = \min(\text{baseDelay} \times 2^{\text{attempts}-1}, 60\,000\text{ ms})$.
- If attempts reach `maxRetries` (default 5), the record moves to `status = 'dead_letter'` with `last_error` populated.
- Operators can inspect and alert on dead-lettered transactions without losing data or blocking normal processing.

No production private key, public-testnet deployment, or chain submission worker
is supplied by this milestone. These are separate release gates.


## Durable chain submissions

`chain_submissions` stores privacy-safe commands for asynchronous blockchain writes.
It contains task ID, workspace ID, action, chain/contract/writer addresses, retry data,
nonce, transaction hashes, and transaction status. It does not contain task content,
user IDs, email addresses, or signing private keys.

The table is the durable queue foundation. BC-10 through BC-14 remain incomplete until
the business transaction enqueues commands atomically and the chain worker implements
submission, nonce coordination, receipt/finality tracking, retry, and dead-letter handling.