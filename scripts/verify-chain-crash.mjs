import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { Pool } from "pg";
import { createPublicClient, http, keccak256 } from "viem";

assert.equal(process.env.CHAIN_RPC_URL, "http://verification-chain:8545",
  "Crash injection is allowed only against the isolated verification chain");
const pool = new Pool({ connectionString: process.env.TODO_DATABASE_URL });
const rpc = createPublicClient({ transport: http(process.env.CHAIN_RPC_URL) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  assert.ok(await rpc.getCode({ address: process.env.TASK_HISTORY_CONTRACT_ADDRESS }),
    "RPC restart must preserve the deployed contract before crash injection");
  assert.ok(await rpc.getBalance({ address: process.env.CHAIN_WRITER_ADDRESS }) > 0n,
    "RPC restart must preserve the funded writer account");
  if (process.argv[2] === "--recover") {
    const hash = process.argv[3];
    assert.match(hash, /^0x[0-9a-f]{64}$/);
    const deadline = Date.now() + 180000;
    let row;
    do {
      await rpc.request({ method: "evm_mine", params: [] });
      row = (await pool.query("SELECT * FROM chain_submissions WHERE transaction_hash = $1", [hash])).rows[0];
      assert.ok(row, "The durable transaction must survive restart");
      if (row.status === "confirmed") break;
      await sleep(1000);
    } while (Date.now() < deadline);
    assert.equal(row.status, "confirmed", "Restarted writers must reconcile the pre-crash hash");
    const logs = await rpc.getLogs({ address: row.contract_address, fromBlock: 0n });
    assert.equal(logs.filter((log) => log.transactionHash === hash).length, 1);
    console.log(JSON.stringify({ check: "BC-11 crash after broadcast", passed: true, transactionHash: hash }));
  } else {
    const queued = await pool.query("SELECT count(*)::int AS count FROM chain_submissions WHERE status = 'pending'");
    assert.ok(queued.rows[0].count > 0, "Queue real HTTP-created tasks before crash injection");
    let broadcastResolve;
    let broadcastReject;
    const broadcast = new Promise((resolve, reject) => {
      broadcastResolve = resolve;
      broadcastReject = reject;
    });
    const server = createServer(async (request, response) => {
      try {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const upstream = await fetch(process.env.CHAIN_RPC_URL, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
        });
        const result = await upstream.json();
        if (payload.method === "eth_sendRawTransaction" && !result.error) {
          const hash = keccak256(payload.params[0]);
          assert.equal(result.result, hash);
          broadcastResolve(hash);
          // Deliberately withhold the actual RPC acknowledgement until the real worker is killed.
          return;
        }
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(result));
      } catch (error) {
        broadcastReject(error);
        response.statusCode = 502;
        response.end("RPC proxy failed");
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    await rpc.request({ method: "evm_setAutomine", params: [false] });
    const worker = spawn(process.execPath, ["apps/todo-service/dist/src/blockchain/chain-submission.worker.js"], {
      env: { ...process.env, CHAIN_RPC_URL: `http://127.0.0.1:${server.address().port}` },
      stdio: "ignore",
    });
    let timer;
    try {
      const hash = await Promise.race([
        broadcast,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Worker did not broadcast before claim recovery deadline")), 180000); }),
      ]);
      const row = (await pool.query("SELECT * FROM chain_submissions WHERE transaction_hash = $1", [hash])).rows[0];
      assert.ok(row.transaction_request, "Public transaction fields must be durable before broadcast");
      assert.equal(row.status, "reserved", "Worker must be killed before marking the send acknowledged");
      assert.ok(row.nonce !== null);
      worker.kill("SIGKILL");
      await once(worker, "exit");
      console.log(JSON.stringify({ transactionHash: hash }));
    } finally {
      clearTimeout(timer);
      if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL");
      server.closeAllConnections();
      server.close();
      await rpc.request({ method: "evm_setAutomine", params: [true] });
      await rpc.request({ method: "evm_mine", params: [] });
      await rpc.request({ method: "evm_mine", params: [] });
    }
  }
} finally {
  await pool.end();
}
