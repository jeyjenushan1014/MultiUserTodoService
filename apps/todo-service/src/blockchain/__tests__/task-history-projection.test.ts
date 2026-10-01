import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  Pool,
  PoolClient,
} from "pg";

import {
  TaskHistoryProjectionRepository,
  type ChainEventRow,
} from "../task-history-projection.repository.js";

function createMockPool(): {
  pool: Pool;
  client: PoolClient;
  queries: { text: string; values: unknown[] | undefined }[];
} {
  const queries: { text: string; values: unknown[] | undefined }[] = [];

  const client = {
    query: vi.fn((text: string, values: unknown[] | undefined) => {
      queries.push({ text, values });
      if (text.includes("SELECT block_number, block_hash")) {
        return Promise.resolve({
          rows: [
            { block_number: "10", block_hash: "0xhash10" },
            { block_number: "9", block_hash: "0xhash9" },
          ],
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
      if (text.includes("SELECT block_number, block_hash")) {
        return Promise.resolve({
          rows: [
            { block_number: "10", block_hash: "0xhash10" },
            { block_number: "9", block_hash: "0xhash9" },
          ],
        });
      }
      if (text.includes("SELECT last_scanned_block")) {
        return Promise.resolve({
          rows: [
            {
              last_scanned_block: "10",
              last_scanned_block_hash: "0xhash10",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    }),
  } as unknown as Pool;

  return { pool, client, queries };
}

describe("TaskHistoryProjectionRepository", () => {
  it("commits scanned range with idempotent ON CONFLICT clauses (BC-7)", async () => {
    const { pool, queries } = createMockPool();
    const repository = new TaskHistoryProjectionRepository(pool);

    const event: ChainEventRow = {
      chainId: 31337,
      contractAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      transactionHash: "0xtxhash1",
      logIndex: 0,
      blockNumber: 10n,
      blockHash: "0xblockhash10",
      taskId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      action: "created",
      chainTimestamp: new Date("2026-10-01T00:00:00.000Z"),
    };

    await repository.commitScannedRange({
      chainId: 31337,
      contractAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      fromBlock: 10n,
      toBlock: 10n,
      endBlockHash: "0xblockhash10",
      events: [event],
    });

    const eventInsert = queries.find((q) =>
      q.text.includes("INSERT INTO task_chain_events"),
    );
    expect(eventInsert).toBeDefined();
    expect(eventInsert?.text).toContain("ON CONFLICT");
    expect(eventInsert?.text).toContain("DO NOTHING");

    const checkpointInsert = queries.find((q) =>
      q.text.includes("INSERT INTO chain_projection_checkpoints"),
    );
    expect(checkpointInsert).toBeDefined();
    expect(checkpointInsert?.text).toContain("ON CONFLICT");
    expect(checkpointInsert?.text).toContain("DO UPDATE SET");
  });

  it("rolls back projection past common ancestor block on reorganization (BC-8)", async () => {
    const { pool, queries } = createMockPool();
    const repository = new TaskHistoryProjectionRepository(pool);

    await repository.rollbackAfterBlock({
      chainId: 31337,
      contractAddress: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      ancestorBlock: 8n,
      ancestorHash: "0xancestorhash8",
    });

    const deleteEvents = queries.find((q) =>
      q.text.includes("DELETE FROM task_chain_events") &&
      q.text.includes("block_number > $3"),
    );
    expect(deleteEvents).toBeDefined();
    expect(deleteEvents?.values?.[2]).toBe("8");

    const deleteBlocks = queries.find((q) =>
      q.text.includes("DELETE FROM chain_projection_blocks") &&
      q.text.includes("block_number > $3"),
    );
    expect(deleteBlocks).toBeDefined();
    expect(deleteBlocks?.values?.[2]).toBe("8");

    const updateCheckpoint = queries.find((q) =>
      q.text.includes("INSERT INTO chain_projection_checkpoints"),
    );
    expect(updateCheckpoint).toBeDefined();
    expect(updateCheckpoint?.values?.[2]).toBe("8");
    expect(updateCheckpoint?.values?.[3]).toBe("0xancestorhash8");
  });

  it("clears all projection tables when rebuilding (BC-6)", async () => {
    const { pool, queries } = createMockPool();
    const repository = new TaskHistoryProjectionRepository(pool);

    await repository.clearProjection(
      31337,
      "0x5fbdb2315678afecb367f032d93f642f64180aa3",
    );

    const deletedTables = queries
      .filter((q) => q.text.includes("DELETE FROM"))
      .map((q) => q.text);

    expect(deletedTables.some((t) => t.includes("task_chain_events"))).toBe(true);
    expect(deletedTables.some((t) => t.includes("chain_projection_blocks"))).toBe(true);
    expect(deletedTables.some((t) => t.includes("chain_projection_checkpoints"))).toBe(true);
  });

  it("enforces that confirmations must be greater than one (BC-9)", async () => {
    // BC-9 states: "A record shall be treated as final only after a stated number of confirmations. That number shall be configurable, documented, and shall not be one."
    const { env } = await import("../../config/env.js");
    expect(env.CHAIN_CONFIRMATIONS).toBeGreaterThanOrEqual(2);
    expect(env.CHAIN_CONFIRMATIONS).not.toBe(1);
  });
});
