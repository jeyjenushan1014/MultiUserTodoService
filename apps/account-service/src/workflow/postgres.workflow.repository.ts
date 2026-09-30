import {
  randomUUID,
} from "node:crypto";

import type {
  PoolClient,
  QueryResultRow,
} from "pg";

import type {
  WorkflowStatus,
  WorkflowStepName,
  WorkflowStepStatus,
} from "@todo/contracts";

import {
  database,
} from "../config/database.js";

import type {
  WorkflowRecord,
  WorkflowRepository,
  WorkflowStepRecord,
} from "./workflow.types.js";

interface WorkflowRow extends QueryResultRow {
  id: string;
  owner_id: string;
  idempotency_key: string;
  correlation_id: string;
  input: { workspaceName: string };
  status: WorkflowStatus;
  current_step: WorkflowStepName | null;
  created_at: Date;
  updated_at: Date;
}

interface StepRow extends QueryResultRow {
  name: WorkflowStepName;
  status: WorkflowStepStatus;
  attempts: number;
  compensation_attempts: number;
  last_error: string | null;
}

const STEP_NAMES: readonly WorkflowStepName[] = [
  "account-reservation",
  "todo-reservation",
  "gateway-publication",
];

export class PostgresWorkflowRepository implements WorkflowRepository {
  public async create(input: { ownerId: string; idempotencyKey: string; correlationId: string; workspaceName: string }): Promise<WorkflowRecord> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const id = randomUUID();
      const inserted = await client.query<WorkflowRow>(
        `INSERT INTO workflows (id, kind, owner_id, idempotency_key, correlation_id, input, status)
         VALUES ($1, 'workspace-provisioning', $2, $3, $4, $5::jsonb, 'running')
         ON CONFLICT (owner_id, idempotency_key) DO NOTHING RETURNING *`,
        [id, input.ownerId, input.idempotencyKey, input.correlationId, JSON.stringify({ workspaceName: input.workspaceName })],
      );
      let workflowId = inserted.rows[0]?.id;
      if (workflowId !== undefined) {
        for (const [position, name] of STEP_NAMES.entries()) {
          await client.query(
            "INSERT INTO workflow_steps (workflow_id, name, position) VALUES ($1, $2, $3)",
            [workflowId, name, position],
          );
        }
      } else {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM workflows WHERE owner_id = $1 AND idempotency_key = $2",
          [input.ownerId, input.idempotencyKey],
        );
        workflowId = existing.rows[0]?.id;
      }
      await client.query("COMMIT");
      if (workflowId === undefined) throw new Error("Workflow insert did not return an identifier");
      const record = await this.findWithClient(client, workflowId);
      if (record === null) throw new Error("Workflow disappeared after creation");
      return record;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async findOwned(id: string, ownerId: string): Promise<WorkflowRecord | null> {
    return this.findBy("w.id = $1 AND w.owner_id = $2", [id, ownerId]);
  }

  public async find(id: string): Promise<WorkflowRecord | null> {
    return this.findBy("w.id = $1", [id]);
  }

  public async claimNext(workerId: string, leaseMilliseconds: number): Promise<WorkflowRecord | null> {
    const result = await database.query<{ id: string }>(
      `UPDATE workflows SET lease_owner = $1,
         lease_expires_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'), updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM workflows
         WHERE status IN ('running', 'compensating') AND next_attempt_at <= CURRENT_TIMESTAMP
           AND (lease_expires_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP)
         ORDER BY next_attempt_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id`,
      [workerId, leaseMilliseconds],
    );
    const id = result.rows[0]?.id;
    return id === undefined ? null : this.find(id);
  }

  public async beginStep(id: string, step: WorkflowStepName, compensating: boolean): Promise<void> {
    await database.query(
      `UPDATE workflow_steps SET status = $3, updated_at = CURRENT_TIMESTAMP WHERE workflow_id = $1 AND name = $2`,
      [id, step, compensating ? "compensating" : "applying"],
    );
    await database.query("UPDATE workflows SET current_step = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [id, step]);
  }

  public async finishStep(id: string, step: WorkflowStepName, compensating: boolean): Promise<void> {
    await database.query(
      "UPDATE workflow_steps SET status = $3, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE workflow_id = $1 AND name = $2",
      [id, step, compensating ? "compensated" : "applied"],
    );
  }

  public async recordFailure(id: string, step: WorkflowStepName, compensating: boolean, message: string): Promise<number> {
    const column = compensating ? "compensation_attempts" : "attempts";
    const result = await database.query<{ count: number }>(
      `UPDATE workflow_steps SET ${column} = ${column} + 1, status = 'failed', last_error = $3, updated_at = CURRENT_TIMESTAMP
       WHERE workflow_id = $1 AND name = $2 RETURNING ${column} AS count`,
      [id, step, message.slice(0, 500)],
    );
    return result.rows[0]?.count ?? 0;
  }

  public async setStatus(id: string, status: WorkflowStatus, currentStep: WorkflowStepName | null, delayMilliseconds = 0): Promise<void> {
    await database.query(
      `UPDATE workflows SET status = $2, current_step = $3, lease_owner = NULL, lease_expires_at = NULL,
       next_attempt_at = CURRENT_TIMESTAMP + ($4 * INTERVAL '1 millisecond'), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id, status, currentStep, delayMilliseconds],
    );
  }

  public async countStuckCompensations(olderThan: Date): Promise<number> {
    const result = await database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM workflows WHERE status IN ('compensating', 'compensation_failed') AND updated_at < $1",
      [olderThan],
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  private async findBy(predicate: string, values: readonly unknown[]): Promise<WorkflowRecord | null> {
    const result = await database.query<WorkflowRow>(`SELECT w.* FROM workflows w WHERE ${predicate}`, [...values]);
    const row = result.rows[0];
    if (row === undefined) return null;
    const steps = await database.query<StepRow>("SELECT name, status, attempts, compensation_attempts, last_error FROM workflow_steps WHERE workflow_id = $1 ORDER BY position", [row.id]);
    return this.map(row, steps.rows);
  }

  private async findWithClient(client: PoolClient, id: string): Promise<WorkflowRecord | null> {
    const workflow = await client.query<WorkflowRow>("SELECT * FROM workflows WHERE id = $1", [id]);
    const row = workflow.rows[0];
    if (row === undefined) return null;
    const steps = await client.query<StepRow>("SELECT name, status, attempts, compensation_attempts, last_error FROM workflow_steps WHERE workflow_id = $1 ORDER BY position", [id]);
    return this.map(row, steps.rows);
  }

  private map(row: WorkflowRow, steps: readonly StepRow[]): WorkflowRecord {
    const mappedSteps: WorkflowStepRecord[] = steps.map((step) => ({
      name: step.name,
      status: step.status,
      attempts: step.attempts,
      compensationAttempts: step.compensation_attempts,
      lastError: step.last_error,
    }));
    return {
      id: row.id,
      ownerId: row.owner_id,
      idempotencyKey: row.idempotency_key,
      correlationId: row.correlation_id,
      workspaceName: row.input.workspaceName,
      status: row.status,
      currentStep: row.current_step,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: mappedSteps,
    };
  }
}