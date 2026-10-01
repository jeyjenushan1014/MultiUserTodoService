import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  PostgresChainSubmissionRepository,
  type ChainSubmissionRecord,
} from "../chain-submission.repository.js";
import { ChainSubmissionService } from "../chain-submission.service.js";
import type { SecureSignerKeyProvider } from "../signer-key-provider.js";

function createMockDb(): {
  pool: Pool;
  client: PoolClient;
  queries: { text: string; values: unknown[] | undefined }[];
} {
  const queries: { text: string; values: unknown[] | undefined }[] = [];

  const client = {
    query: vi.fn((text: string, values: unknown[] | undefined) => {
      queries.push({ text, values });
      if (text.includes("SELECT next_nonce")) {
        return Promise.resolve({
          rows: [{ next_nonce: "5" }],
        });
      }
      if (text.includes("SELECT attempts FROM chain_submissions")) {
        return Promise.resolve({
          rows: [{ attempts: 0 }],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    }),
    release: vi.fn(),
  } as unknown as PoolClient;

  const pool = {
    connect: vi.fn(() => Promise.resolve(client)),
    query: vi.fn((text: string, values: unknown[] | undefined) => {
      queries.push({ text, values });
      if (text.includes("SELECT next_nonce")) {
        return Promise.resolve({
          rows: [{ next_nonce: "5" }],
        });
      }
      if (text.includes("SELECT attempts FROM chain_submissions")) {
        return Promise.resolve({
          rows: [{ attempts: 0 }],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    }),
  } as unknown as Pool;

  return { pool, client, queries };
}

describe("Chain Submissions (BC-10, BC-11, BC-12, BC-13, BC-14)", () => {
  describe("PostgresChainSubmissionRepository", () => {
    it("claims pending submissions using FOR UPDATE SKIP LOCKED for multi-worker safety (BC-10)", async () => {
      const { pool, queries } = createMockDb();
      const repo = new PostgresChainSubmissionRepository(pool);

      await repo.claimPendingSubmissions("worker-1", 5);

      const claimQuery = queries.find((q) =>
        q.text.includes("FOR UPDATE SKIP LOCKED"),
      );
      expect(claimQuery).toBeDefined();
      expect(claimQuery?.text).toContain("status IN ('pending', 'reserved')");
      expect(claimQuery?.values).toEqual(["worker-1", 5]);
    });

    it("atomically allocates next sequential nonce across workers using DB lock (BC-12)", async () => {
      const { pool, client, queries } = createMockDb();
      const repo = new PostgresChainSubmissionRepository(pool);

      const allocated = await repo.allocateNextNonce(
        client,
        31337n,
        "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        3n, // onChainCount is lower than stored 5, so 5 is used
      );

      expect(allocated).toBe(5n);

      const lockQuery = queries.find((q) =>
        q.text.includes("SELECT next_nonce") && q.text.includes("FOR UPDATE"),
      );
      expect(lockQuery).toBeDefined();

      const updateQuery = queries.find((q) =>
        q.text.includes("UPDATE chain_writer_nonces") &&
        q.text.includes("SET next_nonce = $3"),
      );
      expect(updateQuery).toBeDefined();
      expect(updateQuery?.values?.[2]).toBe("6"); // incremented to 6
    });

    it("transitions state between pending, reserved, submitted, confirmed, replaced, abandoned (BC-11)", async () => {
      const { pool, client, queries } = createMockDb();
      const repo = new PostgresChainSubmissionRepository(pool);

      await repo.markReserved(client, "sub-1", 12n);
      expect(
        queries.some(
          (q) =>
            q.text.includes("status = 'reserved'") &&
            q.values?.[1] === "12",
        ),
      ).toBe(true);

      await repo.markSubmitted("sub-1", "0xtxhash123");
      expect(
        queries.some(
          (q) =>
            q.text.includes("status = 'submitted'") &&
            q.values?.[1] === "0xtxhash123",
        ),
      ).toBe(true);

      await repo.markConfirmed("sub-1", 100n, "0xblockhash");
      expect(
        queries.some(
          (q) =>
            q.text.includes("status = 'confirmed'") &&
            q.values?.[1] === "100",
        ),
      ).toBe(true);

      await repo.markReplaced("sub-1", "0xreplacementhash");
      expect(
        queries.some(
          (q) =>
            q.text.includes("status = 'replaced'") &&
            q.values?.[1] === "0xreplacementhash",
        ),
      ).toBe(true);

      await repo.markAbandoned("sub-1", "dropped due to reorganization");
      expect(
        queries.some(
          (q) =>
            q.text.includes("status = 'abandoned'") &&
            q.values?.[1] === "dropped due to reorganization",
        ),
      ).toBe(true);
    });

    it("schedules exponential backoff on failure and routes to dead_letter when retries exceed limit (BC-14)", async () => {
      const { pool, client } = createMockDb();
      const repo = new PostgresChainSubmissionRepository(pool);

      // Attempt 1 -> retry with pending
      const res1 = await repo.recordFailure(
        "sub-1",
        new Error("RPC Timeout"),
        3,
      );
      expect(res1.status).toBe("pending");
      expect(res1.nextAttemptAt).toBeDefined();

      // Mock DB to return attempts = 2
      vi.spyOn(client, "query").mockReturnValue(
        Promise.resolve({
          rows: [{ attempts: 2 }],
          rowCount: 1,
        }) as unknown as ReturnType<PoolClient["query"]>,
      );

      // Attempt 3 (>= max 3) -> dead_letter
      const res2 = await repo.recordFailure(
        "sub-1",
        new Error("Permanent RPC Failure"),
        3,
      );
      expect(res2.status).toBe("dead_letter");
      expect(res2.nextAttemptAt).toBeUndefined();
    });
  });

  describe("ChainSubmissionService (BC-10, BC-13)", () => {
    it("submits transaction to blockchain and updates state to submitted without blocking business API", async () => {
      const { pool } = createMockDb();

      const mockSigner: SecureSignerKeyProvider = {
        address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        getAccount: vi.fn(),
      } as unknown as SecureSignerKeyProvider;

      const mockPublicClient = {
        getTransactionCount: vi.fn().mockResolvedValue(0),
      };

      const mockWalletClient = {
        writeContract: vi.fn().mockResolvedValue("0xmocktxhash"),
      };

      const service = new ChainSubmissionService({
        pool,
        signerProvider: mockSigner,
        publicClient: mockPublicClient as never,
        walletClient: mockWalletClient as never,
      });

      const submission: ChainSubmissionRecord = {
        id: "sub-123",
        sourceEventId: "evt-123",
        taskId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        action: "created",
        chainId: 31337n,
        contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        writerAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        nonce: null,
        transactionHash: null,
        replacementTransactionHash: null,
        confirmedBlockNumber: null,
        confirmedBlockHash: null,
        lastError: null,
      };

      await service.processSubmission(pool, submission);

      expect(mockWalletClient.writeContract).toHaveBeenCalledTimes(1);
    });
  });
});
