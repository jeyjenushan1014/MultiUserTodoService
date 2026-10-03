import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createPublicClient, defineChain, http } from "viem";
import { TaskHistoryIndexer, uuidToBytes16 } from "../apps/todo-service/dist/src/blockchain/task-history-indexer.js";
import { TaskHistoryProjectionRepository } from "../apps/todo-service/dist/src/blockchain/task-history-projection.repository.js";
import { PostgresChainSubmissionRepository } from "../apps/todo-service/dist/src/blockchain/chain-submission.repository.js";

assert.equal(process.env.CHAIN_RPC_URL, "http://verification-chain:8545",
  "This destructive verifier requires the disposable Day 4 chain");
const pool = new Pool({ connectionString: process.env.TODO_DATABASE_URL, max: 3 });
const chain = defineChain({
  id: 31337, name: "verification", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.CHAIN_RPC_URL] } },
});
const rpc = createPublicClient({ chain, transport: http(process.env.CHAIN_RPC_URL, { timeout: 5000, retryCount: 0 }) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, description, timeout = 120000) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await sleep(500);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}
async function request(path, body, token, idempotencyKey = randomUUID()) {
  const response = await fetch(`http://edge:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey,
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}
async function createTasks(count) {
  const email = `chain-${randomUUID()}@example.invalid`;
  const password = "StrongPassword123!";
  assert.equal((await request("/api/v1/auth/register", { email, password })).status, 201);
  const login = await request("/api/v1/auth/login", { email, password });
  assert.equal(login.status, 200);
  const token = login.body.data.accessToken;
  assert.equal(typeof token, "string");
  const tasks = [];
  for (let i = 0; i < count; i++) {
    let created;
    const title = `chain-proof-${randomUUID()}`;
    const idempotencyKey = randomUUID();
    await waitFor(async () => {
      created = await request("/api/v1/todos", { title }, token, idempotencyKey);
      if (created.status === 201) return true;
      assert.equal(created.status, 503, "Only owner projection delay may be retried");
      assert.equal(created.body.error?.code, "OWNER_PROJECTION_NOT_READY",
        "An actual dependency/API failure must not be hidden by a projection retry");
      return false;
    }, "owner projection");
    assert.match(created.body.id, /^[0-9a-f-]{36}$/i, "Created task must expose its public UUID");
    tasks.push(created.body.id);
  }
  const queued = await pool.query("SELECT * FROM chain_submissions WHERE task_id = ANY($1::uuid[])", [tasks]);
  assert.equal(queued.rowCount, count, "Real HTTP mutations must enqueue chain writes");
  return tasks;
}
try {
  if (process.argv.includes("--outage")) {
    const start = Date.now();
    const tasks = await createTasks(2);
    assert.ok(Date.now() - start < 30000, "Chain outage must not stall business requests");
    console.log(JSON.stringify({ check: "BC-10/BC-13", passed: true, queuedDuringOutage: tasks.length }));
  } else {
    const nonceRepository = new PostgresChainSubmissionRepository(pool);
    const unusedWriter = `0x${randomBytes(20).toString("hex")}`;
    const initialCount = await rpc.getTransactionCount({ address: unusedWriter });
    const allocated = await Promise.all(Array.from({ length: 12 }, async () => {
      const transaction = await pool.connect();
      try {
        await transaction.query("BEGIN");
        const nonce = await nonceRepository.allocateNextNonce(transaction, 31337, unusedWriter, BigInt(initialCount));
        await transaction.query("COMMIT");
        return Number(nonce);
      } catch (error) {
        await transaction.query("ROLLBACK");
        throw error;
      } finally {
        transaction.release();
      }
    }));
    assert.deepEqual(allocated.sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => initialCount + i),
      "Real concurrent PostgreSQL transactions must safely initialize a new writer nonce row");
    const tasks = await createTasks(12);
    const miner = setInterval(() => {
      void rpc.request({ method: "evm_mine", params: [] }).catch((error) => {
        console.error(`Mining failed: ${error.name}`);
      });
    }, 1000);
    try {
      await waitFor(async () => {
        const rows = await pool.query(
          "SELECT status FROM chain_submissions WHERE task_id = ANY($1::uuid[])", [tasks]);
        return rows.rows.every((row) => row.status === "confirmed");
      }, "two deployed writers to confirm application submissions");
      const submissions = await pool.query(
        "SELECT nonce, transaction_hash FROM chain_submissions WHERE task_id = ANY($1::uuid[])", [tasks]);
      assert.equal(new Set(submissions.rows.map((row) => row.nonce)).size, tasks.length);
      assert.ok(submissions.rows.every((row) => /^0x[0-9a-f]{64}$/.test(row.transaction_hash)));
      const abi = JSON.parse(await readFile(new URL(
        "../apps/todo-service/src/blockchain/generated/task-history.abi.json", import.meta.url), "utf8"));
      for (const taskId of tasks) {
        const count = await rpc.readContract({
          address: process.env.TASK_HISTORY_CONTRACT_ADDRESS, abi,
          functionName: "getRecordCount", args: [uuidToBytes16(taskId)],
        });
        assert.equal(count, 1n, "Concurrent real workers must write each task exactly once");
      }
      await waitFor(async () => {
        const result = await pool.query(
          "SELECT count(*)::int AS count FROM task_chain_events WHERE task_id = ANY($1::uuid[])", [tasks]);
        return result.rows[0].count === tasks.length;
      }, "deployed indexer to consume real chain logs");

      const [deployer] = await rpc.request({ method: "eth_accounts" });
      const artifact = JSON.parse(await readFile("/app/verification-contract/TaskHistoryModule#TaskHistory.json", "utf8"));
      const hash = await rpc.request({ method: "eth_sendTransaction", params: [{
        from: deployer,
        data: `${artifact.bytecode}${process.env.CHAIN_WRITER_ADDRESS.slice(2).padStart(64, "0")}`,
        gas: "0x7a1200",
      }] });
      const deployed = await rpc.waitForTransactionReceipt({ hash });
      assert.equal(deployed.status, "success");
      const replacement = deployed.contractAddress;
      assert.ok(replacement);
      const original = (await pool.query("SELECT * FROM chain_submissions WHERE task_id = $1", [tasks[0]])).rows[0];
      await pool.query(
        `INSERT INTO chain_submissions
         (id, source_event_id, task_id, workspace_id, action, chain_id, contract_address, writer_address)
         VALUES ($1, $2, $3, $4, 'updated', $5, $6, $7)`,
        [randomUUID(), randomUUID(), tasks[0], original.workspace_id, original.chain_id, replacement.toLowerCase(), original.writer_address],
      );
      await waitFor(async () => {
        const result = await pool.query(
          "SELECT status FROM chain_submissions WHERE task_id = $1 AND contract_address = $2",
          [tasks[0], replacement.toLowerCase()]);
        return result.rows[0].status === "confirmed";
      }, "application writer to submit to replacement contract");
      const repository = new TaskHistoryProjectionRepository(pool);
      const indexer = new TaskHistoryIndexer(repository, {
        address: replacement, deploymentBlock: Number(deployed.blockNumber),
      });
      await indexer.verifyConfiguredChain();
      await indexer.rebuild();
      await indexer.pollOnce();
      const records = await repository.findTaskRecords(31337, tasks[0]);
      assert.deepEqual(records.map((record) => record.action), ["created", "updated"]);
      assert.equal(records[0].contractAddress, process.env.TASK_HISTORY_CONTRACT_ADDRESS.toLowerCase());
      assert.equal(records[1].contractAddress, replacement.toLowerCase());
      for (const record of records) {
        const history = await rpc.readContract({
          address: record.contractAddress, abi, functionName: "getHistory",
          args: [uuidToBytes16(tasks[0]), 0n, 50n],
        });
        assert.equal(history.length, 1);
        assert.equal(history[0].timestamp, record.chainTimestamp);
      }

      const poisonId = randomUUID();
      await pool.query(
        `INSERT INTO chain_submissions
         (id, source_event_id, task_id, workspace_id, action, chain_id, contract_address, writer_address)
         VALUES ($1, $2, $3, $4, 'created', 31337, $5, $6)`,
        [poisonId, randomUUID(), randomUUID(), original.workspace_id,
          original.contract_address, "0x0000000000000000000000000000000000000001"],
      );
      await waitFor(async () => {
        const result = await pool.query("SELECT status, attempts FROM chain_submissions WHERE id = $1", [poisonId]);
        if (result.rows[0].status !== "dead_letter") return false;
        assert.equal(result.rows[0].attempts, 5);
        return true;
      }, "bounded writer failure to reach human-review queue");
      console.log(JSON.stringify({
        passed: true, tasks: tasks.length, checks: ["BC-10", "BC-12", "BC-14", "EV-11"],
        evidence: "HTTP -> PostgreSQL -> two deployed writers -> local EVM -> deployed indexer; two real contracts",
      }));
    } finally {
      clearInterval(miner);
    }
  }
} finally {
  await pool.end();
}
