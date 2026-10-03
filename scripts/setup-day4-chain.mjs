import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const url = process.env.CHAIN_RPC_URL;
assert.equal(url, "http://verification-chain:8545", "Only the isolated local chain is allowed");
const deadline = Date.now() + 90_000;
async function rpc(method, params = []) {
  const response = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  assert.ok(response.ok);
  const body = await response.json();
  if (body.error) throw new Error(`Local chain RPC failed: ${method}`);
  return body.result;
}
let ready = false;
while (Date.now() < deadline) {
  try {
    assert.equal(await rpc("eth_chainId"), "0x7a69");
    ready = true;
    break;
  } catch { await new Promise((resolve) => setTimeout(resolve, 1000)); }
}
assert.ok(ready, "Isolated chain failed to start");
const [deployer] = await rpc("eth_accounts");
const writer = process.env.CHAIN_WRITER_ADDRESS;
assert.match(writer, /^0x[0-9a-f]{40}$/i);
const artifact = JSON.parse(await readFile("/app/verification-contract/TaskHistoryModule#TaskHistory.json", "utf8"));
assert.match(artifact.bytecode, /^0x[0-9a-f]+$/i);
assert.equal(await rpc("eth_getCode", [process.env.TASK_HISTORY_CONTRACT_ADDRESS, "latest"]), "0x", "Fresh chain required");
const transaction = await rpc("eth_sendTransaction", [{
  from: deployer, data: `${artifact.bytecode}${writer.slice(2).padStart(64, "0")}`, gas: "0x7a1200",
}]);
let receipt;
while (Date.now() < deadline) {
  receipt = await rpc("eth_getTransactionReceipt", [transaction]);
  if (receipt) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.equal(receipt?.status, "0x1");
assert.equal(receipt.contractAddress.toLowerCase(), process.env.TASK_HISTORY_CONTRACT_ADDRESS.toLowerCase());
assert.equal(BigInt(receipt.blockNumber), BigInt(process.env.TASK_HISTORY_DEPLOYMENT_BLOCK));
assert.notEqual(await rpc("eth_getCode", [receipt.contractAddress, "latest"]), "0x");
await rpc("eth_sendTransaction", [{
  from: deployer, to: writer, value: "0x56bc75e2d63100000",
}]);
await rpc("evm_mine");
await rpc("evm_mine");
console.log(JSON.stringify({ result: "deployed", chainId: 31337, contract: receipt.contractAddress, scope: "disposable local chain only; committed deployment bytecode fixture" }));
