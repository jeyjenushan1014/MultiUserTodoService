import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  type Abi,
} from "viem";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import type {
  TaskHistoryProjectionRepository,
  ChainEventRow,
} from "./task-history-projection.repository.js";

function resolveAbiPath(): string {
  const candidates = [
    fileURLToPath(new URL("./generated/task-history.abi.json", import.meta.url)),
    fileURLToPath(new URL("../blockchain/generated/task-history.abi.json", import.meta.url)),
    fileURLToPath(new URL("../../src/blockchain/generated/task-history.abi.json", import.meta.url)),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `TaskHistory ABI file not found in any candidate location: ${candidates.join(", ")}`,
  );
}

const abiPath = resolveAbiPath();

const abiJson = JSON.parse(
  await readFile(abiPath, "utf8"),
) as Abi;

const chain = defineChain({
  id: env.CHAIN_ID,
  name: `configured-chain-${env.CHAIN_ID}`,
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [env.CHAIN_RPC_URL],
    },
  },
});

const client = createPublicClient({
  chain,
  transport: http(env.CHAIN_RPC_URL),
});

const contractAddress = getAddress(
  env.TASK_HISTORY_CONTRACT_ADDRESS,
);

const eventName = "TaskActionRecorded";

export function uuidToBytes16(value: string): string {
  return `0x${value.replaceAll("-", "").toLowerCase()}`;
}

function bytes16ToUuid(value: string): string {
  const hex = value.replace(/^0x/, "").toLowerCase();

  if (!/^[a-f0-9]{32}$/.test(hex)) {
    throw new Error("Contract emitted an invalid bytes16 identifier");
  }

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function actionToName(
  value: unknown,
): ChainEventRow["action"] {
  if (value === 0 || value === 0n || value === "0" || value === "created") {
    return "created";
  }

  if (value === 1 || value === 1n || value === "1" || value === "updated") {
    return "updated";
  }

  if (value === 2 || value === 2n || value === "2" || value === "deleted") {
    return "deleted";
  }

  throw new Error("Contract emitted an unknown task action");
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Contract event arguments were not an object");
  }

  return value as Record<string, unknown>;
}

function asHexString(
  value: unknown,
  name: string,
): string {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`Event field ${name} was missing or invalid`);
  }

  return value;
}

function asBigInt(
  value: unknown,
  name: string,
): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  throw new Error(`Event field ${name} was missing or invalid`);
}

export class TaskHistoryIndexer {
  constructor(
    private readonly repository: TaskHistoryProjectionRepository,
  ) {}

  async verifyConfiguredChain(): Promise<void> {
    const actualChainId = await client.getChainId();

    if (actualChainId !== env.CHAIN_ID) {
      throw new Error(
        `Configured CHAIN_ID ${env.CHAIN_ID} does not match RPC chain ${actualChainId}`,
      );
    }
  }

  async rebuild(): Promise<void> {
    await this.repository.clearProjection(
      env.CHAIN_ID,
      contractAddress,
    );

    logger.info(
      {
        chainId: env.CHAIN_ID,
        contractAddress,
        deploymentBlock: env.TASK_HISTORY_DEPLOYMENT_BLOCK,
      },
      "Cleared local chain projection; rebuilding from deployment block",
    );

    await this.pollOnce();
  }

  async pollOnce(): Promise<void> {
    const checkpoint = await this.repository.getCheckpoint(
      env.CHAIN_ID,
      contractAddress,
    );

    const deploymentBlock = BigInt(
      env.TASK_HISTORY_DEPLOYMENT_BLOCK,
    );

    if (checkpoint !== undefined) {
      await this.reconcileReorganization(
        checkpoint.lastScannedBlock,
      );
    }

    const latestBlock = await client.getBlockNumber();

    const confirmations = BigInt(
      env.CHAIN_CONFIRMATIONS,
    );

    if (latestBlock + 1n < confirmations) {
      return;
    }

    const safeHead = latestBlock - confirmations + 1n;

    const freshCheckpoint = await this.repository.getCheckpoint(
      env.CHAIN_ID,
      contractAddress,
    );

    const fromBlock =
      freshCheckpoint === undefined
        ? deploymentBlock
        : freshCheckpoint.lastScannedBlock + 1n;

    if (fromBlock > safeHead) {
      return;
    }

    const scanRange = BigInt(env.CHAIN_SCAN_RANGE);

    let cursor = fromBlock;

    while (cursor <= safeHead) {
      const toBlock =
        cursor + scanRange - 1n > safeHead
          ? safeHead
          : cursor + scanRange - 1n;

      await this.scanRange(cursor, toBlock);
      cursor = toBlock + 1n;
    }
  }

  private async reconcileReorganization(
    lastScannedBlock: bigint,
  ): Promise<void> {
    const checkpoints =
      await this.repository.getRecentBlockCheckpoints(
        env.CHAIN_ID,
        contractAddress,
        100,
      );

    if (checkpoints.length === 0) {
      return;
    }

    const latestCheckpoint = checkpoints[0];

    if (latestCheckpoint === undefined) {
      return;
    }

    const currentAtLatest = await client.getBlock({
      blockNumber: latestCheckpoint.blockNumber,
    });

    if (
      currentAtLatest.hash.toLowerCase() ===
      latestCheckpoint.blockHash.toLowerCase()
    ) {
      return;
    }

    logger.warn(
      {
        lastScannedBlock: lastScannedBlock.toString(),
        checkpointBlock: latestCheckpoint.blockNumber.toString(),
      },
      "Chain reorganization detected; searching for a common ancestor",
    );

    for (const checkpoint of checkpoints) {
      try {
        const currentBlock = await client.getBlock({
          blockNumber: checkpoint.blockNumber,
        });

        if (
          currentBlock.hash.toLowerCase() ===
          checkpoint.blockHash.toLowerCase()
        ) {
          await this.repository.rollbackAfterBlock({
            chainId: env.CHAIN_ID,
            contractAddress,
            ancestorBlock: checkpoint.blockNumber,
            ancestorHash: checkpoint.blockHash,
          });

          logger.warn(
            {
              ancestorBlock: checkpoint.blockNumber.toString(),
            },
            "Rolled back projection to common chain ancestor",
          );

          return;
        }
      } catch {
        // A saved checkpoint may refer to a block height no longer available
        // from the RPC node. Continue searching older checkpoints.
      }
    }

    const deploymentBlock = BigInt(
      env.TASK_HISTORY_DEPLOYMENT_BLOCK,
    );

    if (deploymentBlock === 0n) {
      await this.repository.clearProjection(
        env.CHAIN_ID,
        contractAddress,
      );
      return;
    }

    const baseBlockNumber = deploymentBlock - 1n;
    const baseBlock = await client.getBlock({
      blockNumber: baseBlockNumber,
    });

    await this.repository.rollbackAfterBlock({
      chainId: env.CHAIN_ID,
      contractAddress,
      ancestorBlock: baseBlockNumber,
      ancestorHash: baseBlock.hash,
    });
  }

  private async scanRange(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<void> {
    const logs = await client.getLogs({
      address: contractAddress,
      fromBlock,
      toBlock,
    });

    const decodedEvents: ChainEventRow[] = [];
    const timestampByBlock = new Map<bigint, Date>();

    for (const log of logs) {
      const decoded = decodeEventLog({
        abi: abiJson,
        eventName,
        topics: log.topics,
        data: log.data,
        strict: true,
      });

      const args = asRecord(decoded.args);
      const taskIdBytes = asHexString(args.taskId, "taskId");
      const workspaceIdBytes = asHexString(
        args.workspaceId,
        "workspaceId",
      );
      const timestampSeconds = asBigInt(
        args.timestamp,
        "timestamp",
      );

      const chainTimestamp = new Date(
        Number(timestampSeconds) * 1_000,
      );

      if (Number.isNaN(chainTimestamp.getTime())) {
        throw new Error("Contract emitted an invalid timestamp");
      }

      timestampByBlock.set(log.blockNumber, chainTimestamp);

      decodedEvents.push({
        chainId: env.CHAIN_ID,
        contractAddress,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        taskId: bytes16ToUuid(taskIdBytes),
        workspaceId: bytes16ToUuid(workspaceIdBytes),
        action: actionToName(args.action),
        chainTimestamp,
      });
    }

    const endBlock = await client.getBlock({
      blockNumber: toBlock,
    });

    await this.repository.commitScannedRange({
      chainId: env.CHAIN_ID,
      contractAddress,
      fromBlock,
      toBlock,
      endBlockHash: endBlock.hash,
      events: decodedEvents,
    });

    logger.info(
      {
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        eventCount: decodedEvents.length,
      },
      "Indexed confirmed task-history chain range",
    );
  }
}