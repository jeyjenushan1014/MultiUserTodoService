#!/usr/bin/env node
import assert from "node:assert/strict";
import amqp from "amqplib";

const [deletionRequestId, userId, email] = process.argv.slice(2);
if (!deletionRequestId || !userId || !email) {
  throw new Error("Usage: verify-account-erasure.mjs <deletion-request-id> <user-id> <email>");
}

const serviceKey = process.env.INTERNAL_SERVICE_SECRET;
if (!serviceKey) throw new Error("INTERNAL_SERVICE_SECRET is required");

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-service-key": serviceKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Erasure verification endpoint failed with HTTP ${response.status}`);
  return response.json();
}

async function rpc(method, params) {
  const response = await fetch(process.env.CHAIN_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Chain RPC failed with HTTP ${response.status}`);
  const result = await response.json();
  if (result.error) throw new Error(`Chain RPC ${method} failed`);
  return result.result;
}

async function inspectQueue(channel, queue, compactUserId, emailHex) {
  const state = await channel.checkQueue(queue);
  let matches = 0;
  for (let index = 0; index < state.messageCount; index += 1) {
    const message = await channel.get(queue, { noAck: false });
    if (message === false) break;
    const body = message.content.toString("utf8").toLowerCase();
    const match = body.includes(userId.toLowerCase()) || body.includes(compactUserId) || body.includes(email.toLowerCase()) || body.includes(emailHex);
    if (match) matches += 1;
    const published = channel.publish(message.fields.exchange, message.fields.routingKey, message.content, message.properties);
    if (!published) await new Promise((resolve) => channel.once("drain", resolve));
    await channel.waitForConfirms();
    channel.ack(message);
  }
  return matches;
}

const account = await postJson("http://account-service:3001/internal/v1/accounts/deletion/verify", {
  deletionRequestId,
  userId,
  email,
});
assert.equal(account.verified, true, "Account database still contains deletion-linked data");

const todo = await postJson("http://todo-service:3002/internal/v1/account-deletions/verify", { userId, email });
assert.equal(todo.verified, true, "Todo database or chain projection still contains deletion-linked data");

const gateway = await postJson("http://gateway:3000/internal/v1/account-deletions/verify", {
  userId,
  workspaceIds: account.workspaceIds,
});
assert.equal(gateway.verified, true, "Gateway Redis still contains deletion-linked authorization state");

const queueNames = (process.env.ACCOUNT_DELETION_BROKER_QUEUES ??
  "todo.notifications,todo.notifications.dlq,todo.owner-projection,todo.owner-projection.retry,todo.owner-projection.dlq,todo.history,todo.history.retry,todo.history.dlq,todo.workspace-membership,gateway.session-revocations,gateway.workspace-membership")
  .split(",").map((queue) => queue.trim()).filter(Boolean);
const connection = await amqp.connect(process.env.RABBITMQ_URL);
let brokerMessages = 0;
try {
  for (const queue of queueNames) {
    const channel = await connection.createConfirmChannel();
    try {
      brokerMessages += await inspectQueue(channel, queue, userId.replaceAll("-", ""), Buffer.from(email).toString("hex"));
    } finally {
      await channel.close();
    }
  }
} finally {
  await connection.close();
}
assert.equal(brokerMessages, 0, "Broker queues or DLQs still contain deletion-linked messages");

const contractAddress = process.env.TASK_HISTORY_CONTRACT_ADDRESS;
const deploymentBlock = BigInt(process.env.TASK_HISTORY_DEPLOYMENT_BLOCK ?? "0");
const latestBlock = BigInt(await rpc("eth_blockNumber", []));
const compactUserId = userId.replaceAll("-", "").toLowerCase();
const emailHex = Buffer.from(email).toString("hex");
let scannedLogs = 0;
for (let from = deploymentBlock; from <= latestBlock; from += 2000n) {
  const to = from + 1999n < latestBlock ? from + 1999n : latestBlock;
  const logs = await rpc("eth_getLogs", [{
    address: contractAddress,
    fromBlock: `0x${from.toString(16)}`,
    toBlock: `0x${to.toString(16)}`,
  }]);
  for (const log of logs) {
    scannedLogs += 1;
    const encoded = `${log.topics.join("")}${log.data}`.toLowerCase();
    assert.equal(encoded.includes(compactUserId), false, "A chain log contains the deleted account identifier");
    assert.equal(encoded.includes(emailHex), false, "A chain log contains the deleted account email");
  }
}

console.log(JSON.stringify({
  verified: true,
  deletionRequestId,
  account: account.remaining,
  todo: todo.remaining,
  gateway,
  brokerMessages,
  scannedLogs,
  chainHead: latestBlock.toString(),
}));