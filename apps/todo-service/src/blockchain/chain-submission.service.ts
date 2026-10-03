import type { Pool } from "pg";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  encodeFunctionData,
  keccak256,
  TransactionReceiptNotFoundError,
  type Abi,
  type PublicClient,
  type WalletClient,
} from "viem";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
  PostgresChainSubmissionRepository,
  type ChainSubmissionRecord,
} from "./chain-submission.repository.js";
import { SecureSignerKeyProvider } from "./signer-key-provider.js";
import { uuidToBytes16 } from "./task-history-indexer.js";

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

const actionToEnum = {
  created: 0,
  updated: 1,
  deleted: 2,
} as const;

export interface ChainSubmissionServiceOptions {
  readonly pool: Pool;
  readonly signerProvider?: SecureSignerKeyProvider;
  readonly publicClient?: PublicClient;
  readonly walletClient?: WalletClient;
  readonly maxRetries?: number;
}

export class ChainSubmissionService {
  private readonly repository: PostgresChainSubmissionRepository;
  private readonly signerProvider: SecureSignerKeyProvider;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly maxRetries: number;
  private abiJson: Abi | undefined;

  constructor(options: ChainSubmissionServiceOptions) {
    this.repository = new PostgresChainSubmissionRepository(options.pool);
    this.maxRetries = options.maxRetries ?? 5;

    this.signerProvider =
      options.signerProvider ?? new SecureSignerKeyProvider();

    const chain = defineChain({
      id: env.CHAIN_ID,
      name: `configured-chain-${env.CHAIN_ID}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [env.CHAIN_RPC_URL] } },
    });

    this.publicClient =
      options.publicClient ??
      (createPublicClient({
        chain,
        transport: http(env.CHAIN_RPC_URL, { timeout: 5000, retryCount: 0 }),
      }) as unknown as PublicClient);

    this.walletClient =
      options.walletClient ??
      (createWalletClient({
        account: this.signerProvider.getAccount(),
        chain,
        transport: http(env.CHAIN_RPC_URL, { timeout: 5000, retryCount: 0 }),
      }) as unknown as WalletClient);
  }

  private async getAbi(): Promise<Abi> {
    if (!this.abiJson) {
      const path = resolveAbiPath();
      this.abiJson = JSON.parse(await readFile(path, "utf8")) as Abi;
    }
    return this.abiJson;
  }

  /**
   * Process a single claimed submission:
   * 1. Allocate atomic sequential nonce (BC-12).
   * 2. Transition state to 'reserved' (BC-11).
   * 3. Encode & broadcast transaction via wallet client (BC-10).
   * 4. Transition state to 'submitted' (BC-11).
   * 5. Handle RPC failure with retry / DLQ (BC-14).
   */
  async processSubmission(
    pool: Pool,
    submission: ChainSubmissionRecord,
  ): Promise<void> {
    const client = await pool.connect();
    let transactionOpen = false;
    let acquired = false;

    try {
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
        [`chain-submission:${submission.id}`],
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) return;
      submission = (await this.repository.getById(submission.id)) ?? submission;
      if (!["pending", "reserved", "submitted", "dead_letter"].includes(submission.status)) return;
      if (submission.chainId !== BigInt(env.CHAIN_ID) ||
          submission.writerAddress.toLowerCase() !== this.signerProvider.address.toLowerCase()) {
        throw new Error("Submission network or writer does not match this worker");
      }

      if (submission.transactionHash) {
        try {
          const receipt = await this.publicClient.getTransactionReceipt({
            hash: submission.transactionHash as `0x${string}`,
          });
          const head = await this.publicClient.getBlockNumber({ cacheTime: 0 });
          if (head - receipt.blockNumber + 1n >= BigInt(env.CHAIN_CONFIRMATIONS)) {
            if (receipt.status === "success") {
              await this.repository.markConfirmed(submission.id, receipt.blockNumber, receipt.blockHash);
            } else {
              await this.repository.markAbandoned(submission.id, "Transaction reverted on chain");
            }
          }
          await this.repository.releaseClaim(submission.id);
          return;
        } catch (error) {
          if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
        }
      }

      if (submission.status === "dead_letter") {
        await this.repository.releaseClaim(submission.id);
        return;
      }

      await client.query("BEGIN");
      transactionOpen = true;

      // Step 1: Query current on-chain transaction count for writer
      const onChainTxCount = BigInt(
        await this.publicClient.getTransactionCount({
          address: this.signerProvider.address,
          blockTag: "pending",
        }),
      );

      // Step 2: Atomic Nonce Allocation (BC-12)
      const nonce =
        submission.nonce ??
        (await this.repository.allocateNextNonce(
          client,
          submission.chainId,
          submission.writerAddress,
          onChainTxCount,
        ));

      // Transition to reserved
      await this.repository.markReserved(client, submission.id, nonce);

      const abi = await this.getAbi();
      const taskIdBytes16 = uuidToBytes16(submission.taskId) as `0x${string}`;
      const workspaceIdBytes16 = uuidToBytes16(submission.workspaceId) as `0x${string}`;
      const actionEnum = actionToEnum[submission.action];
      const data = encodeFunctionData({
        abi, functionName: "recordTaskAction",
        args: [taskIdBytes16, workspaceIdBytes16, actionEnum],
      });
      const request = submission.transactionRequest ?? await (async () => {
        const fees = await this.publicClient.estimateFeesPerGas();
        const gas = await this.publicClient.estimateGas({
          account: this.signerProvider.getAccount(),
          to: getAddress(submission.contractAddress), data,
        });
        return {
          gas: gas.toString(),
          maxFeePerGas: fees.maxFeePerGas.toString(),
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
        };
      })();
      const serializedTransaction = await this.walletClient.signTransaction({
        to: getAddress(submission.contractAddress), data,
        nonce: Number(nonce), gas: BigInt(request.gas),
        maxFeePerGas: BigInt(request.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(request.maxPriorityFeePerGas),
        account: this.signerProvider.getAccount(),
        chain: this.walletClient.chain,
      });
      const txHash = keccak256(serializedTransaction);
      // Persist the hash and public transaction fields before any broadcast.
      // A restarted worker signs the identical request, not a second contract call.
      await this.repository.saveTransactionRequest(client, submission.id, request, txHash);
      await client.query("COMMIT");
      transactionOpen = false;

      logger.info(
        {
          submissionId: submission.id,
          taskId: submission.taskId,
          action: submission.action,
          nonce: nonce.toString(),
        },
        "Submitting transaction to TaskHistory smart contract",
      );

      await this.publicClient.sendRawTransaction({ serializedTransaction });

      // Step 4: Record submitted state (BC-11)
      await this.repository.markSubmitted(submission.id, txHash);

      logger.info(
        {
          submissionId: submission.id,
          txHash,
          nonce: nonce.toString(),
        },
        "Chain submission successfully broadcasted",
      );
    } catch (error: unknown) {
      if (transactionOpen) await client.query("ROLLBACK");
      // RPC error objects can contain signed request details; retain only their class.
      const err = new Error(error instanceof Error ? error.name : "ChainSubmissionError");
      logger.error(
        {
          submissionId: submission.id,
          errorType: err.message,
        },
        "Failed to submit chain transaction; scheduling retry or DLQ",
      );

      // Step 5: Retry backoff or Dead-Letter-Queue (BC-14)
      await this.repository.recordFailure(submission.id, err, this.maxRetries);
    } finally {
      try {
        if (acquired) {
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`chain-submission:${submission.id}`]);
        }
      } finally {
        client.release();
      }
    }
  }

  /**
   * Run one iteration of the submission polling worker
   */
  async pollAndSubmit(pool: Pool, workerId: string, limit = 5): Promise<number> {
    const claimed = await this.repository.claimPendingSubmissions(workerId, limit);

    for (const submission of claimed) {
      await this.processSubmission(pool, submission);
    }

    return claimed.length;
  }
}
