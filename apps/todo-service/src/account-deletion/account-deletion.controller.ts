import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError } from "@todo/common";
import type { TodoExportResponse } from "@todo/contracts";
import { z } from "zod";

import { database } from "../config/database.js";
import { PostgresAccountDeletionRepository } from "./account-deletion.repository.js";
import { purgeWorkspaceMembershipCache } from "../security/workspace-membership.cache.js";
import { getInternalCallerIdentity } from "../middleware/internal-service-auth.middleware.js";

const repository = new PostgresAccountDeletionRepository();
const accountIdSchema = z.uuid();

export const exportAccountData: RequestHandler = async (_request, response): Promise<void> => {
  const identity = getInternalCallerIdentity(response);
  const todos = await database.query<{
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    state: string;
    due_date: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT DISTINCT t.id, t.owner_id, t.title, t.description, t.state, t.due_date,
       t.created_at, t.updated_at, t.deleted_at
     FROM todos AS t
     LEFT JOIN todo_shares AS s ON s.todo_id = t.id AND (s.owner_id = $1 OR s.recipient_id = $1)
     WHERE t.owner_id = $1 OR s.id IS NOT NULL
     ORDER BY t.created_at, t.id`,
    [identity.userId],
  );
  const shares = await database.query<{
    id: string;
    todo_id: string;
    owner_id: string;
    recipient_id: string;
    permission: string;
    shared_at: Date;
    withdrawn_at: Date | null;
  }>(
    `SELECT id, todo_id, owner_id, recipient_id, permission, shared_at, withdrawn_at
     FROM todo_shares WHERE owner_id = $1 OR recipient_id = $1 ORDER BY shared_at, id`,
    [identity.userId],
  );
  const history = await database.query<{
    id: string;
    todo_id: string;
    actor_id: string;
    event_type: string;
    request_id: string;
    occurred_at: Date;
    details: Record<string, unknown>;
  }>(
    `SELECT h.id, h.todo_id, h.actor_id, h.event_type, h.request_id, h.occurred_at, h.details
     FROM todo_history AS h
     WHERE h.actor_id = $1 OR h.todo_id IN (SELECT t.id FROM todos AS t WHERE t.owner_id = $1)
     ORDER BY h.occurred_at, h.id`,
    [identity.userId],
  );
  const body: TodoExportResponse = {
    data: {
      todos: todos.rows.map((todo) => ({
        id: todo.id,
        ownerId: todo.owner_id,
        title: todo.title,
        description: todo.description,
        state: todo.state,
        dueDate: todo.due_date?.toISOString() ?? null,
        createdAt: todo.created_at.toISOString(),
        updatedAt: todo.updated_at.toISOString(),
        deletedAt: todo.deleted_at?.toISOString() ?? null,
      })),
      shares: shares.rows.map((share) => ({
        id: share.id,
        todoId: share.todo_id,
        ownerId: share.owner_id,
        recipientId: share.recipient_id,
        permission: share.permission,
        sharedAt: share.shared_at.toISOString(),
        withdrawnAt: share.withdrawn_at?.toISOString() ?? null,
      })),
      history: history.rows.map((entry) => ({
        id: entry.id,
        todoId: entry.todo_id,
        actorId: entry.actor_id,
        eventType: entry.event_type,
        requestId: entry.request_id,
        occurredAt: entry.occurred_at.toISOString(),
        details: entry.details,
      })),
    },
  };
  response.status(200).json(body);
};

export const eraseAccountData: RequestHandler = async (request, response): Promise<void> => {
  const body = z.object({
    userId: accountIdSchema,
    orphanedWorkspaceIds: z.array(z.uuid()).max(1000),
    workspaceIds: z.array(z.uuid()).max(1000),
  }).safeParse(request.body);
  if (!body.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Account and workspace identifiers are invalid");
  }

  await repository.eraseAccountData(body.data.userId, body.data.orphanedWorkspaceIds);
  response.status(204).end();
};

export const purgeAccountWorkspaceCache: RequestHandler = async (request, response): Promise<void> => {
  const body = z.object({ userId: accountIdSchema, workspaceIds: z.array(z.uuid()).max(1000) }).safeParse(request.body);
  if (!body.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Account and workspace identifiers are invalid");
  }
  await purgeWorkspaceMembershipCache(body.data.userId, body.data.workspaceIds);
  response.status(204).end();
};

export const verifyAccountErasure: RequestHandler = async (request, response): Promise<void> => {
  const body = z.object({ userId: accountIdSchema, email: z.email() }).safeParse(request.body);
  if (!body.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Account identifiers are invalid");
  }
  const userIdHash = createHash("sha256").update(body.data.userId).digest("hex");
  const result = await database.query<{
    owner_records: number;
    email_owner_records: number;
    task_text: number;
    owned_tasks: number;
    shares: number;
    histories: number;
    idempotency_records: number;
    pending_email_changes: number;
    rebuild_members: number;
    workflow_reservations: number;
    outbox_payloads: number;
    chain_references: number;
    tombstones: number;
  }>(
    `SELECT
      (SELECT COUNT(*)::integer FROM todo_owners WHERE id = $1) AS owner_records,
      (SELECT COUNT(*)::integer FROM todo_owners WHERE email = $2) AS email_owner_records,
      (SELECT COUNT(*)::integer FROM todos WHERE (title ILIKE '%' || $2 || '%') OR (description IS NOT NULL AND description ILIKE '%' || $2 || '%')) AS task_text,
       (SELECT COUNT(*)::integer FROM todos WHERE owner_id = $1) AS owned_tasks,
       (SELECT COUNT(*)::integer FROM todo_shares WHERE owner_id = $1 OR recipient_id = $1) AS shares,
       (SELECT COUNT(*)::integer FROM todo_history WHERE actor_id = $1 OR details::text LIKE '%' || $1 || '%' OR details::text ILIKE '%' || $2 || '%') AS histories,
       (SELECT COUNT(*)::integer FROM todo_idempotency_records WHERE owner_id = $1) AS idempotency_records,
       (SELECT COUNT(*)::integer FROM todo_owner_pending_email_changes WHERE user_id = $1 OR email = $2) AS pending_email_changes,
       (SELECT COUNT(*)::integer FROM todo_owner_projection_rebuild_members WHERE user_id = $1) AS rebuild_members,
       (SELECT COUNT(*)::integer FROM workflow_reservations WHERE owner_id = $1) AS workflow_reservations,
      (SELECT COUNT(*)::integer FROM outbox_events WHERE aggregate_id = $1 OR payload::text LIKE '%' || $1 || '%' OR payload::text ILIKE '%' || $2 || '%') AS outbox_payloads,
       (SELECT COUNT(*)::integer FROM chain_submissions WHERE task_id = $1 OR workspace_id = $1) +
       (SELECT COUNT(*)::integer FROM task_chain_events WHERE task_id = $1 OR workspace_id = $1) AS chain_references,
       (SELECT COUNT(*)::integer FROM account_deletion_tombstones WHERE user_id_hash = $3) AS tombstones`,
    [body.data.userId, body.data.email, userIdHash],
  );
  const remaining = result.rows[0];
  if (remaining === undefined) {
    throw new Error("Deletion verification returned no result");
  }
  const { tombstones, ...linkedRecords } = remaining;
  const verified = tombstones === 1 && Object.values(linkedRecords).every((count) => count === 0);
  response.status(200).json({ verified, remaining: linkedRecords, tombstonePresent: tombstones === 1 });
};