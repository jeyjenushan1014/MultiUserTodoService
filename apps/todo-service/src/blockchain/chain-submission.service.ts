import type { Pool } from "pg";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
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
        transport: http(env.CHAIN_RPC_URL),
      }) as unknown as PublicClient);

    this.walletClient =
      options.walletClient ??
      (createWalletClient({
        account: this.signerProvider.getAccount(),
        chain,
        transport: http(env.CHAIN_RPC_URL),
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

    try {
      await client.query("BEGIN");

      // Step 1: Query current on-chain transaction count for writer
      const onChainTxCount = BigInt(
        await this.publicClient.getTransactionCount({
          address: this.signerProvider.address,
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

      await client.query("COMMIT");

      // Step 3: Broadcast transaction to chain (BC-10)
      const abi = await this.getAbi();
      const taskIdBytes16 = uuidToBytes16(submission.taskId) as `0x${string}`;
      const workspaceIdBytes16 = uuidToBytes16(submission.workspaceId) as `0x${string}`;
      const actionEnum = actionToEnum[submission.action];

      logger.info(
        {
          submissionId: submission.id,
          taskId: submission.taskId,
          action: submission.action,
          nonce: nonce.toString(),
        },
        "Submitting transaction to TaskHistory smart contract",
      );

      const txHash = await this.walletClient.writeContract({
        address: getAddress(submission.contractAddress),
        abi,
        functionName: "recordTaskAction",
        args: [taskIdBytes16, workspaceIdBytes16, actionEnum],
        nonce: Number(nonce),
        account: this.signerProvider.getAccount(),
        chain: this.walletClient.chain,
      });

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
      const err = error instanceof Error ? error : new Error(String(error));

      logger.error(
        {
          submissionId: submission.id,
          err,
        },
        "Failed to submit chain transaction; scheduling retry or DLQ",
      );

      // Step 5: Retry backoff or Dead-Letter-Queue (BC-14)
      await this.repository.recordFailure(submission.id, err, this.maxRetries);
    } finally {
      client.release();
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
