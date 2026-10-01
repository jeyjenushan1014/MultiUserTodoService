import type {
  Pool,
  PoolClient,
} from "pg";

export interface ChainEventRow {
  chainId: number;
  contractAddress: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  taskId: string;
  workspaceId: string;
  action: "created" | "updated" | "deleted";
  chainTimestamp: Date;
}

export interface ProjectionCheckpoint {
  lastScannedBlock: bigint;
  lastScannedBlockHash: string;
}

export class TaskHistoryProjectionRepository {
  constructor(
    private readonly pool: Pool,
  ) {}

  async acquireWorkerLock(
    lockName: string,
  ): Promise<PoolClient | undefined> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
        [lockName],
      );

      if (result.rows[0]?.acquired !== true) {
        client.release();
        return undefined;
      }

      return client;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async releaseWorkerLock(
    client: PoolClient,
    lockName: string,
  ): Promise<void> {
    try {
      await client.query(
        `SELECT pg_advisory_unlock(hashtext($1))`,
        [lockName],
      );
    } finally {
      client.release();
    }
  }

  async getCheckpoint(
    chainId: number,
    contractAddress: string,
  ): Promise<ProjectionCheckpoint | undefined> {
    const result = await this.pool.query<{
      last_scanned_block: string;
      last_scanned_block_hash: string;
    }>(
      `
        SELECT
          last_scanned_block,
          last_scanned_block_hash
        FROM chain_projection_checkpoints
        WHERE chain_id = $1
          AND contract_address = $2
      `,
      [chainId, contractAddress.toLowerCase()],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return undefined;
    }

    return {
      lastScannedBlock: BigInt(row.last_scanned_block),
      lastScannedBlockHash: row.last_scanned_block_hash,
    };
  }

  async getRecentBlockCheckpoints(
    chainId: number,
    contractAddress: string,
    limit: number,
  ): Promise<{ blockNumber: bigint; blockHash: string }[]> {
    const result = await this.pool.query<{
      block_number: string;
      block_hash: string;
    }>(
      `
        SELECT block_number, block_hash
        FROM chain_projection_blocks
        WHERE chain_id = $1
          AND contract_address = $2
        ORDER BY block_number DESC
        LIMIT $3
      `,
      [chainId, contractAddress.toLowerCase(), limit],
    );

    return result.rows.map((row) => ({
      blockNumber: BigInt(row.block_number),
      blockHash: row.block_hash,
    }));
  }

  async commitScannedRange(input: {
    chainId: number;
    contractAddress: string;
    fromBlock: bigint;
    toBlock: bigint;
    endBlockHash: string;
    events: ChainEventRow[];
  }): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const event of input.events) {
        await client.query(
          `
            INSERT INTO task_chain_events (
              chain_id,
              contract_address,
              transaction_hash,
              log_index,
              block_number,
              block_hash,
              task_id,
              workspace_id,
              action,
              chain_timestamp
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (
              chain_id,
              contract_address,
              transaction_hash,
              log_index
            ) DO NOTHING
          `,
          [
            event.chainId,
            event.contractAddress.toLowerCase(),
            event.transactionHash.toLowerCase(),
            event.logIndex,
            event.blockNumber.toString(),
            event.blockHash.toLowerCase(),
            event.taskId,
            event.workspaceId,
            event.action,
            event.chainTimestamp,
          ],
        );
      }

      await client.query(
        `
          INSERT INTO chain_projection_blocks (
            chain_id,
            contract_address,
            block_number,
            block_hash
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (chain_id, contract_address, block_number)
          DO UPDATE SET block_hash = EXCLUDED.block_hash
        `,
        [
          input.chainId,
          input.contractAddress.toLowerCase(),
          input.toBlock.toString(),
          input.endBlockHash.toLowerCase(),
        ],
      );

      await client.query(
        `
          INSERT INTO chain_projection_checkpoints (
            chain_id,
            contract_address,
            last_scanned_block,
            last_scanned_block_hash,
            updated_at
          )
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (chain_id, contract_address)
          DO UPDATE SET
            last_scanned_block = EXCLUDED.last_scanned_block,
            last_scanned_block_hash = EXCLUDED.last_scanned_block_hash,
            updated_at = NOW()
        `,
        [
          input.chainId,
          input.contractAddress.toLowerCase(),
          input.toBlock.toString(),
          input.endBlockHash.toLowerCase(),
        ],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async rollbackAfterBlock(input: {
    chainId: number;
    contractAddress: string;
    ancestorBlock: bigint;
    ancestorHash: string;
  }): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
          DELETE FROM task_chain_events
          WHERE chain_id = $1
            AND contract_address = $2
            AND block_number > $3
        `,
        [
          input.chainId,
          input.contractAddress.toLowerCase(),
          input.ancestorBlock.toString(),
        ],
      );

      await client.query(
        `
          DELETE FROM chain_projection_blocks
          WHERE chain_id = $1
            AND contract_address = $2
            AND block_number > $3
        `,
        [
          input.chainId,
          input.contractAddress.toLowerCase(),
          input.ancestorBlock.toString(),
        ],
      );

      await client.query(
        `
          INSERT INTO chain_projection_checkpoints (
            chain_id,
            contract_address,
            last_scanned_block,
            last_scanned_block_hash,
            updated_at
          )
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (chain_id, contract_address)
          DO UPDATE SET
            last_scanned_block = EXCLUDED.last_scanned_block,
            last_scanned_block_hash = EXCLUDED.last_scanned_block_hash,
            updated_at = NOW()
        `,
        [
          input.chainId,
          input.contractAddress.toLowerCase(),
          input.ancestorBlock.toString(),
          input.ancestorHash.toLowerCase(),
        ],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async clearProjection(
    chainId: number,
    contractAddress: string,
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
          DELETE FROM task_chain_events
          WHERE chain_id = $1 AND contract_address = $2
        `,
        [chainId, contractAddress.toLowerCase()],
      );

      await client.query(
        `
          DELETE FROM chain_projection_blocks
          WHERE chain_id = $1 AND contract_address = $2
        `,
        [chainId, contractAddress.toLowerCase()],
      );

      await client.query(
        `
          DELETE FROM chain_projection_checkpoints
          WHERE chain_id = $1 AND contract_address = $2
        `,
        [chainId, contractAddress.toLowerCase()],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}