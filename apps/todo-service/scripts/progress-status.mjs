import { database } from "../dist/src/config/database.js";
import { env } from "../dist/src/config/env.js";

const queues = [
  ["account-notifications", env.RABBITMQ_NOTIFICATION_QUEUE],
  ["todo-owner-projection", env.TODO_OWNER_QUEUE],
  ["todo-history", env.TODO_HISTORY_QUEUE],
  ["todo-workspace-membership", env.TODO_WORKSPACE_MEMBERSHIP_QUEUE],
  ["gateway-session-revocation", env.GATEWAY_SESSION_REVOCATION_QUEUE],
  ["gateway-workspace-membership", env.GATEWAY_WORKSPACE_MEMBERSHIP_QUEUE],
];

function authorization() {
  return `Basic ${Buffer.from(`${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}`).toString("base64")}`;
}

async function getQueueProgress(name, queue) {
  if (!env.RABBITMQ_USER || !env.RABBITMQ_PASSWORD) {
    return { name, queue, status: "unavailable" };
  }
  try {
    const response = await fetch(
      `${env.RABBITMQ_MANAGEMENT_URL}/api/queues/%2f/${encodeURIComponent(queue)}`,
      { headers: { authorization: authorization() }, signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return { name, queue, status: "unavailable" };
    const body = await response.json();
    return {
      name,
      queue,
      status: "available",
      ready: Number(body.messages_ready ?? 0),
      unacknowledged: Number(body.messages_unacknowledged ?? 0),
      consumers: Number(body.consumers ?? 0),
    };
  } catch {
    return { name, queue, status: "unavailable" };
  }
}

async function getChainProgress() {
  try {
    const [headResponse, checkpointResult] = await Promise.all([
      fetch(env.CHAIN_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        signal: AbortSignal.timeout(3000),
      }),
      database.query(
        `
          SELECT last_scanned_block, updated_at
          FROM chain_projection_checkpoints
          WHERE chain_id = $1 AND contract_address = $2
        `,
        [env.CHAIN_ID, env.TASK_HISTORY_CONTRACT_ADDRESS.toLowerCase()],
      ),
    ]);

    if (!headResponse.ok) return { status: "unavailable" };
    const rpc = await headResponse.json();
    if (typeof rpc.result !== "string" || !/^0x[0-9a-f]+$/i.test(rpc.result)) {
      return { status: "unavailable" };
    }

    const latestBlock = BigInt(rpc.result);
    const confirmations = BigInt(env.CHAIN_CONFIRMATIONS);
    const safeHead = latestBlock + 1n < confirmations
      ? -1n
      : latestBlock - confirmations + 1n;
    const checkpoint = checkpointResult.rows[0];
    const deploymentBlock = BigInt(env.TASK_HISTORY_DEPLOYMENT_BLOCK);
    const lastScannedBlock = checkpoint === undefined
      ? deploymentBlock - 1n
      : BigInt(checkpoint.last_scanned_block);
    const lagBlocks = safeHead < deploymentBlock
      ? 0n
      : safeHead > lastScannedBlock
        ? safeHead - lastScannedBlock
        : 0n;

    return {
      status: checkpoint === undefined ? "not-initialized" : lagBlocks === 0n ? "caught-up" : "behind",
      chainId: env.CHAIN_ID,
      latestBlock: latestBlock.toString(),
      safeHead: safeHead.toString(),
      deploymentBlock: deploymentBlock.toString(),
      lastScannedBlock: checkpoint?.last_scanned_block ?? null,
      checkpointUpdatedAt: checkpoint?.updated_at?.toISOString() ?? null,
      lagBlocks: lagBlocks.toString(),
      confirmations: env.CHAIN_CONFIRMATIONS,
    };
  } catch {
    return { status: "unavailable" };
  }
}

try {
  const [consumerProgress, chainReader] = await Promise.all([
    Promise.all(queues.map(([name, queue]) => getQueueProgress(name, queue))),
    getChainProgress(),
  ]);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    consumers: consumerProgress,
    chainReader,
  }, null, 2));
} finally {
  await database.end();
}