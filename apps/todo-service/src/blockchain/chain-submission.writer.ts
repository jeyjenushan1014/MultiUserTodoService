import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { env } from "../config/env.js";

export type ChainTaskAction =
  | "created"
  | "updated"
  | "deleted";

export interface EnqueueChainSubmissionInput {
  readonly sourceEventId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly action: ChainTaskAction;
}

export class PostgresChainSubmissionWriter {
  public async enqueue(
    transaction: PoolClient,
    input: EnqueueChainSubmissionInput,
  ): Promise<void> {
    await transaction.query(
      `
        INSERT INTO chain_submissions (
          id,
          source_event_id,
          task_id,
          workspace_id,
          action,
          chain_id,
          contract_address,
          writer_address,
          status,
          attempts,
          next_attempt_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'pending',
          0,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (source_event_id)
        DO NOTHING
      `,
      [
        randomUUID(),
        input.sourceEventId,
        input.taskId,
        input.workspaceId,
        input.action,
        env.CHAIN_ID,
        env.TASK_HISTORY_CONTRACT_ADDRESS.toLowerCase(),
        env.CHAIN_WRITER_ADDRESS.toLowerCase(),
      ],
    );
  }
}