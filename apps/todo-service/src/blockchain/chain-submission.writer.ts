import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { env } from "../config/env.js";
import { PrivacyGate } from "./privacy-gate.js";

export const DEFAULT_PERSONAL_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";

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

export interface ChainSubmissionWriter {
  enqueue(
    transaction: PoolClient,
    input: EnqueueChainSubmissionInput,
  ): Promise<void>;
}

export class PostgresChainSubmissionWriter implements ChainSubmissionWriter {
  public async enqueue(
    transaction: PoolClient,
    input: EnqueueChainSubmissionInput,
  ): Promise<void> {
    // BC-2: Privacy Gate validation
    PrivacyGate.assertPrivacySafe(input as unknown as Record<string, unknown>);

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