import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError, getRequestId } from "@todo/common";
import type { AccountDeletionRequestResponse, AccountExportResponse } from "@todo/contracts";
import { z } from "zod";

import { database } from "../../../config/database.js";
import { requireInternalIdentity } from "../../../security/internal-identity.js";
import { accountDeletionService } from "./account-deletion.module.js";

export const requestAccountDeletion: RequestHandler = async (request, response): Promise<void> => {
  const identity = requireInternalIdentity(request);
  const idempotencyKey = request.header("idempotency-key");
  const requestId = getRequestId();

  if (idempotencyKey === undefined || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required");
  }
  if (requestId === undefined) {
    throw new AppError(500, "REQUEST_CONTEXT_UNAVAILABLE", "Request context is unavailable");
  }

  const deletionRequest = await accountDeletionService.requestDeletion({
    userId: identity.userId,
    idempotencyKey,
    correlationId: requestId,
  });
  const body: AccountDeletionRequestResponse = {
    data: { deletionRequestId: deletionRequest.id, status: "pending" },
  };
  response.status(202).json(body);
};

export const exportAccount: RequestHandler = async (request, response): Promise<void> => {
  const identity = requireInternalIdentity(request);
  const account = await database.query<{
    id: string;
    email: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT u.id, u.email, u.created_at, u.updated_at
     FROM users AS u
     INNER JOIN sessions AS s ON s.user_id = u.id
     WHERE u.id = $1 AND s.id = $2 AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [identity.userId, identity.sessionId],
  );
  const accountRow = account.rows[0];
  if (accountRow === undefined) {
    throw new AppError(401, "ACCOUNT_UNAVAILABLE", "The account is unavailable");
  }
  const workspaces = await database.query<{
    id: string;
    name: string;
    role: string;
    created_at: Date;
  }>(
    `SELECT w.id, w.name, m.role, w.created_at
     FROM workspaces AS w
     INNER JOIN workspace_members AS m ON m.workspace_id = w.id
     WHERE m.user_id = $1
     ORDER BY w.created_at, w.id`,
    [identity.userId],
  );
  const body: AccountExportResponse = {
    data: {
      generatedAt: new Date().toISOString(),
      account: {
        id: accountRow.id,
        email: accountRow.email,
        createdAt: accountRow.created_at.toISOString(),
        updatedAt: accountRow.updated_at.toISOString(),
      },
      workspaces: workspaces.rows.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        role: workspace.role,
        createdAt: workspace.created_at.toISOString(),
      })),
    },
  };
  response.status(200).json(body);
};

export const verifyAccountErasure: RequestHandler = async (request, response): Promise<void> => {
  const parsed = z.object({
    deletionRequestId: z.uuid(),
    userId: z.uuid(),
    email: z.email(),
  }).safeParse(request.body);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Deletion verification identifiers are invalid");
  }
  const userIdHash = createHash("sha256").update(parsed.data.userId).digest("hex");
  const result = await database.query<{
    request_count: number;
    completed_requests: number;
    linked_requests: number;
    users: number;
    memberships: number;
    workspaces: number;
    sessions: number;
    reset_tokens: number;
    outbox_payloads: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::integer FROM account_deletion_requests WHERE id = $1) AS request_count,
       (SELECT COUNT(*)::integer FROM account_deletion_requests WHERE id = $1 AND status = 'completed' AND user_id IS NULL AND session_ids = '[]'::jsonb) AS completed_requests,
       (SELECT COUNT(*)::integer FROM account_deletion_requests WHERE id = $1 AND user_id_hash = $2) AS linked_requests,
       (SELECT COUNT(*)::integer FROM users WHERE id = $3 OR email = $4) AS users,
       (SELECT COUNT(*)::integer FROM workspace_members WHERE user_id = $3) AS memberships,
       (SELECT COUNT(*)::integer FROM workspaces WHERE created_by = $3) AS workspaces,
       (SELECT COUNT(*)::integer FROM sessions WHERE user_id = $3) AS sessions,
       (SELECT COUNT(*)::integer FROM password_reset_tokens WHERE user_id = $3) AS reset_tokens,
       (SELECT COUNT(*)::integer FROM outbox_events WHERE aggregate_id = $3 OR payload::text LIKE '%' || $3 || '%' OR payload::text ILIKE '%' || $4 || '%') AS outbox_payloads`,
    [parsed.data.deletionRequestId, userIdHash, parsed.data.userId, parsed.data.email],
  );
  const checks = result.rows[0];
  if (checks === undefined) {
    throw new Error("Deletion verification returned no result");
  }
  const verified = checks.request_count === 1
    && checks.completed_requests === 1
    && checks.linked_requests === 1
    && checks.users === 0
    && checks.memberships === 0
    && checks.workspaces === 0
    && checks.sessions === 0
    && checks.reset_tokens === 0
    && checks.outbox_payloads === 0;
  const deletionRequestRow = await database.query<{ workspace_ids: string[] }>(
    "SELECT workspace_ids FROM account_deletion_requests WHERE id = $1",
    [parsed.data.deletionRequestId],
  );
  response.status(200).json({
    verified,
    remaining: checks,
    workspaceIds: deletionRequestRow.rows[0]?.workspace_ids ?? [],
  });
};