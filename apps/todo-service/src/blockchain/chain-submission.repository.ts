import type { Pool, PoolClient } from "pg";

export type ChainSubmissionStatus =
  | "pending"
  | "reserved"
  | "submitted"
  | "confirmed"
  | "replaced"
  | "abandoned"
  | "dead_letter";

export interface ChainSubmissionRecord {
  readonly id: string;
  readonly sourceEventId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly action: "created" | "updated" | "deleted";
  readonly chainId: bigint;
  readonly contractAddress: string;
  readonly writerAddress: string;
  readonly status: ChainSubmissionStatus;
  readonly attempts: number;
  readonly nextAttemptAt: Date;
  readonly nonce: bigint | null;
  readonly transactionHash: string | null;
  readonly replacementTransactionHash: string | null;
  readonly confirmedBlockNumber: bigint | null;
  readonly confirmedBlockHash: string | null;
  readonly lastError: string | null;
}

interface RawSubmissionRow {
  id: string;
  source_event_id: string;
  task_id: string;
  workspace_id: string;
  action: "created" | "updated" | "deleted";
  chain_id: string;
  contract_address: string;
  writer_address: string;
  status: ChainSubmissionStatus;
  attempts: number;
  next_attempt_at: Date;
  nonce: string | null;
  transaction_hash: string | null;
  replacement_transaction_hash: string | null;
  confirmed_block_number: string | null;
  confirmed_block_hash: string | null;
  last_error: string | null;
}

function mapRow(row: RawSubmissionRow): ChainSubmissionRecord {
  return {
    id: row.id,
    sourceEventId: row.source_event_id,
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    action: row.action,
    chainId: BigInt(row.chain_id),
    contractAddress: row.contract_address,
    writerAddress: row.writer_address,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    nonce: row.nonce !== null ? BigInt(row.nonce) : null,
    transactionHash: row.transaction_hash,
    replacementTransactionHash: row.replacement_transaction_hash,
    confirmedBlockNumber:
      row.confirmed_block_number !== null
        ? BigInt(row.confirmed_block_number)
        : null,
    confirmedBlockHash: row.confirmed_block_hash,
    lastError: row.last_error,
  };
}

export class PostgresChainSubmissionRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * BC-10: Claim pending submissions using FOR UPDATE SKIP LOCKED
   * This allows multiple workers to concurrently poll without stepping on each other.
   */
  async claimPendingSubmissions(
    workerId: string,
    limit = 10,
  ): Promise<ChainSubmissionRecord[]> {
    const result = await this.pool.query<RawSubmissionRow>(
      `
        UPDATE chain_submissions
        SET
          locked_at = NOW(),
          locked_by = $1,
          updated_at = NOW()
        WHERE id IN (
          SELECT id
          FROM chain_submissions
          WHERE status IN ('pending', 'reserved')
            AND next_attempt_at <= NOW()
            AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '2 minutes')
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $2
        )
        RETURNING *
      `,
      [workerId, limit],
    );

    return result.rows.map(mapRow);
  }

  /**
   * BC-12: Atomically allocate the next sequential nonce across multiple workers
   * Reads and locks chain_writer_nonces row for the writer address and chainId.
   */
  async allocateNextNonce(
    client: PoolClient,
    chainId: bigint | number,
    writerAddress: string,
    onChainTransactionCount: bigint,
  ): Promise<bigint> {
    const normAddress = writerAddress.toLowerCase();
    const chainIdStr = chainId.toString();

    // Lock and get current stored nonce
    const lockResult = await client.query<{ next_nonce: string }>(
      `
        SELECT next_nonce
        FROM chain_writer_nonces
        WHERE chain_id = $1 AND writer_address = $2
        FOR UPDATE
      `,
      [chainIdStr, normAddress],
    );

    let nextNonce: bigint;

    if (lockResult.rows.length === 0 || lockResult.rows[0] === undefined) {
      // First time initialization: sync with on-chain transaction count
      nextNonce = onChainTransactionCount;
      await client.query(
        `
          INSERT INTO chain_writer_nonces (chain_id, writer_address, next_nonce, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (chain_id, writer_address)
          DO UPDATE SET next_nonce = GREATEST(chain_writer_nonces.next_nonce, EXCLUDED.next_nonce)
        `,
        [chainIdStr, normAddress, (nextNonce + 1n).toString()],
      );
      return nextNonce;
    }

    const dbNext = BigInt(lockResult.rows[0].next_nonce);
    // Use maximum of DB tracked next_nonce and actual on-chain transaction count
    nextNonce = dbNext >= onChainTransactionCount ? dbNext : onChainTransactionCount;

    await client.query(
      `
        UPDATE chain_writer_nonces
        SET next_nonce = $3, updated_at = NOW()
        WHERE chain_id = $1 AND writer_address = $2
      `,
      [chainIdStr, normAddress, (nextNonce + 1n).toString()],
    );

    return nextNonce;
  }

  /**
   * BC-11: Transition submission to reserved state with allocated nonce
   */
  async markReserved(
    client: PoolClient,
    submissionId: string,
    nonce: bigint,
  ): Promise<void> {
    await client.query(
      `
        UPDATE chain_submissions
        SET
          status = 'reserved',
          nonce = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [submissionId, nonce.toString()],
    );
  }

  /**
   * BC-11: Transition submission to submitted state with broadcast transaction hash
   */
  async markSubmitted(
    submissionId: string,
    transactionHash: string,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE chain_submissions
        SET
          status = 'submitted',
          transaction_hash = $2,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [submissionId, transactionHash.toLowerCase()],
    );
  }

  /**
   * BC-11: Mark submission as confirmed once included in a confirmed block
   */
  async markConfirmed(
    submissionId: string,
    blockNumber: bigint,
    blockHash: string,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE chain_submissions
        SET
          status = 'confirmed',
          confirmed_block_number = $2,
          confirmed_block_hash = $3,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [submissionId, blockNumber.toString(), blockHash.toLowerCase()],
    );
  }

  /**
   * BC-11: Mark submission as replaced when replaced by a higher-fee transaction
   */
  async markReplaced(
    submissionId: string,
    replacementTxHash: string,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE chain_submissions
        SET
          status = 'replaced',
          replacement_transaction_hash = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [submissionId, replacementTxHash.toLowerCase()],
    );
  }

  /**
   * BC-11: Mark submission as abandoned
   */
  async markAbandoned(
    submissionId: string,
    reason: string,
  ): Promise<void> {
    await this.pool.query(
      `
        UPDATE chain_submissions
        SET
          status = 'abandoned',
          last_error = $2,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [submissionId, reason],
    );
  }

  /**
   * BC-14: Retry scheduling or move to dead_letter (DLQ) if max retries exceeded
   */
  async recordFailure(
    submissionId: string,
    error: Error,
    maxRetries = 5,
    baseDelayMs = 2000,
  ): Promise<{ status: ChainSubmissionStatus; nextAttemptAt: Date | undefined }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const check = await client.query<{ attempts: number }>(
        `SELECT attempts FROM chain_submissions WHERE id = $1 FOR UPDATE`,
        [submissionId],
      );

      const firstRow = check.rows[0];
      if (firstRow === undefined) {
        await client.query("ROLLBACK");
        throw new Error(`Submission ${submissionId} not found`);
      }

      const nextAttempts = firstRow.attempts + 1;
      const isDeadLetter = nextAttempts >= maxRetries;
      const status: ChainSubmissionStatus = isDeadLetter ? "dead_letter" : "pending";

      // Exponential backoff
      const delayMs = Math.min(baseDelayMs * 2 ** (nextAttempts - 1), 60_000);
      const nextAttemptAt = new Date(Date.now() + delayMs);

      await client.query(
        `
          UPDATE chain_submissions
          SET
            status = $2,
            attempts = $3,
            next_attempt_at = $4,
            last_error = $5,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          submissionId,
          status,
          nextAttempts,
          nextAttemptAt,
          error.message.slice(0, 1000),
        ],
      );

      await client.query("COMMIT");
      return { status, nextAttemptAt: isDeadLetter ? undefined : nextAttemptAt };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getById(id: string): Promise<ChainSubmissionRecord | undefined> {
    const res = await this.pool.query<RawSubmissionRow>(
      `SELECT * FROM chain_submissions WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : undefined;
  }
}
