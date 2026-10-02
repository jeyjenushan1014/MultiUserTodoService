import { createHash, randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import { database } from "../../../config/database.js";
import { insertSessionRevokedOutboxEvent } from "../../../outbox/session-revoked-event.js";
import { insertWorkspaceMembershipChangedOutboxEvent } from "../../workspace/workspace-membership-event.js";
import type {
  AccountDeletionWorkItem,
  AccountDeletionRepository,
  AccountDeletionRequest,
} from "./account-deletion.repository.interface.js";

interface DeletionRequestRow extends QueryResultRow {
  id: string;
  requested_at: Date;
}

interface DeletionWorkRow extends QueryResultRow {
  id: string;
  user_id: string;
  correlation_id: string;
  current_step: AccountDeletionWorkItem["currentStep"];
  orphaned_workspace_ids: string[];
  workspace_ids: string[];
  session_ids: string[];
}

export class PostgresAccountDeletionRepository implements AccountDeletionRepository {
  public async requestDeletion(input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly correlationId: string;
  }): Promise<AccountDeletionRequest> {
    const client = await database.connect();
    const idempotencyKeyHash = createHash("sha256").update(input.idempotencyKey).digest("hex");

    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [input.userId],
      );
      const account = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id = $1 FOR UPDATE",
        [input.userId],
      );
      if (account.rowCount !== 1) {
        throw new Error("Account is unavailable for deletion");
      }
      const pendingRequest = await client.query<DeletionRequestRow>(
        `SELECT id, requested_at FROM account_deletion_requests
         WHERE user_id = $1 AND status IN ('pending', 'running')
         ORDER BY requested_at LIMIT 1 FOR UPDATE`,
        [input.userId],
      );
      const existingRequest = pendingRequest.rows[0];
      if (existingRequest !== undefined) {
        await client.query("COMMIT");
        return { id: existingRequest.id, requestedAt: existingRequest.requested_at };
      }
      const inserted = await client.query<DeletionRequestRow>(
        `INSERT INTO account_deletion_requests (id, user_id, idempotency_key_hash, correlation_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, idempotency_key_hash) DO NOTHING
         RETURNING id, requested_at`,
        [randomUUID(), input.userId, idempotencyKeyHash, input.correlationId],
      );

      let request = inserted.rows[0];
      if (request === undefined) {
        const existing = await client.query<DeletionRequestRow>(
          `SELECT id, requested_at FROM account_deletion_requests
           WHERE user_id = $1 AND idempotency_key_hash = $2`,
          [input.userId, idempotencyKeyHash],
        );
        request = existing.rows[0];
      } else {
        const allSessions = await client.query<{ id: string }>(
          "SELECT id FROM sessions WHERE user_id = $1",
          [input.userId],
        );
        const revokedSessions = await client.query<{ revoked_at: Date }>(
          `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND revoked_at IS NULL
           RETURNING revoked_at`,
          [input.userId],
        );
        const revokedAt = revokedSessions.rows[0]?.revoked_at;
        await client.query(
          "UPDATE account_deletion_requests SET session_ids = $2::jsonb WHERE id = $1",
          [request.id, JSON.stringify(allSessions.rows.map((session) => session.id))],
        );
        if (revokedAt !== undefined) {
          await insertSessionRevokedOutboxEvent(client, input.userId, null, revokedAt);
        }
      }

      if (request === undefined) {
        throw new Error("Deletion request was not persisted");
      }

      await client.query("COMMIT");
      return { id: request.id, requestedAt: request.requested_at };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async claimNext(workerId: string, leaseMilliseconds: number): Promise<AccountDeletionWorkItem | null> {
    const result = await database.query<DeletionWorkRow>(
      `UPDATE account_deletion_requests SET
         status = 'running',
         lease_owner = $1,
         lease_expires_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
         attempts = attempts + 1
       WHERE id = (
         SELECT id FROM account_deletion_requests
         WHERE status IN ('pending', 'running')
           AND user_id IS NOT NULL
           AND next_attempt_at <= CURRENT_TIMESTAMP
           AND (lease_expires_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP)
         ORDER BY next_attempt_at, requested_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
      RETURNING id, user_id, correlation_id, current_step, orphaned_workspace_ids, workspace_ids, session_ids`,
      [workerId, leaseMilliseconds],
    );
    const row = result.rows[0];
    return row === undefined ? null : {
      id: row.id,
      userId: row.user_id,
      correlationId: row.correlation_id,
      currentStep: row.current_step,
      orphanedWorkspaceIds: row.orphaned_workspace_ids,
      workspaceIds: row.workspace_ids,
      sessionIds: row.session_ids,
    };
  }

  public async prepareWorkspaceDeletion(requestId: string): Promise<{
    readonly orphanedWorkspaceIds: readonly string[];
    readonly workspaceIds: readonly string[];
  }> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const request = await client.query<DeletionWorkRow>(
        `SELECT id, user_id, correlation_id, current_step, orphaned_workspace_ids, workspace_ids, session_ids
         FROM account_deletion_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      );
      const row = request.rows[0];
      if (row === undefined) {
        throw new Error("Account deletion request is unavailable");
      }
      if (row.current_step !== "prepare-workspaces") {
        await client.query("COMMIT");
        return {
          orphanedWorkspaceIds: row.orphaned_workspace_ids,
          workspaceIds: row.workspace_ids,
        };
      }

      const memberships = await client.query<{
        workspace_id: string;
        role: string;
        created_by: string;
      }>(
        `SELECT member.workspace_id, member.role, workspace.created_by
         FROM workspace_members AS member
         INNER JOIN workspaces AS workspace ON workspace.id = member.workspace_id
         WHERE member.user_id = $1
         ORDER BY member.workspace_id
         FOR UPDATE OF workspace, member`,
        [row.user_id],
      );
      const orphanedWorkspaceIds: string[] = [];
      const workspaceIds = memberships.rows.map((membership) => membership.workspace_id);

      for (const membership of memberships.rows) {
        const otherMembers = await client.query<{
          user_id: string;
          role: string;
        }>(
          `SELECT user_id, role FROM workspace_members
           WHERE workspace_id = $1 AND user_id <> $2
           ORDER BY created_at, user_id FOR UPDATE`,
          [membership.workspace_id, row.user_id],
        );
        const successor = otherMembers.rows[0];
        if (successor === undefined) {
          orphanedWorkspaceIds.push(membership.workspace_id);
          await client.query("DELETE FROM workspaces WHERE id = $1", [membership.workspace_id]);
          continue;
        }

        const hasAdministrator = otherMembers.rows.some((member) => member.role === "administrator");
        if (!hasAdministrator) {
          await client.query(
            `UPDATE workspace_members SET role = 'administrator', updated_at = CURRENT_TIMESTAMP
             WHERE workspace_id = $1 AND user_id = $2`,
            [membership.workspace_id, successor.user_id],
          );
          await insertWorkspaceMembershipChangedOutboxEvent(client, {
            eventId: randomUUID(),
            workspaceId: membership.workspace_id,
            userId: successor.user_id,
            role: "administrator",
            changedAt: new Date(),
            requestId: row.correlation_id,
          });
        }
        if (membership.created_by === row.user_id) {
          await client.query("UPDATE workspaces SET created_by = $2 WHERE id = $1", [membership.workspace_id, successor.user_id]);
        }
        await client.query(
          "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [membership.workspace_id, row.user_id],
        );
        await insertWorkspaceMembershipChangedOutboxEvent(client, {
          eventId: randomUUID(),
          workspaceId: membership.workspace_id,
          userId: row.user_id,
          role: null,
          changedAt: new Date(),
          requestId: row.correlation_id,
        });
      }

      await client.query(
          `UPDATE account_deletion_requests SET
            current_step = 'todo-cleanup', orphaned_workspace_ids = $2::jsonb, workspace_ids = $3::jsonb,
           last_error = NULL
         WHERE id = $1`,
          [requestId, JSON.stringify(orphanedWorkspaceIds), JSON.stringify(workspaceIds)],
      );
      await client.query("COMMIT");
      return { orphanedWorkspaceIds, workspaceIds };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async advance(requestId: string, currentStep: "todo-cleanup" | "account-cleanup"): Promise<void> {
    await database.query(
      `UPDATE account_deletion_requests SET current_step = $2,
        last_error = NULL
       WHERE id = $1 AND status = 'running'`,
      [requestId, currentStep],
    );
  }

  public async findDeletionEmail(userId: string): Promise<string> {
    const result = await database.query<{ email: string }>(
      "SELECT email FROM users WHERE id = $1",
      [userId],
    );
    const email = result.rows[0]?.email;
    if (email === undefined) {
      throw new Error("Account is unavailable during deletion");
    }
    return email;
  }

  public async hasUnpublishedIdentityEvents(userId: string, email: string): Promise<boolean> {
    const result = await database.query<{ pending: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM outbox_events
         WHERE (aggregate_id = $1 OR payload->>'userId' = $1
           OR payload->>'ownerId' = $1 OR payload->>'recipientId' = $1
           OR payload->>'email' = $2)
           AND published_at IS NULL
       ) AS pending`,
      [userId, email],
    );
    return result.rows[0]?.pending === true;
  }

  public async complete(requestId: string): Promise<void> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ user_id: string | null }>(
        "SELECT user_id FROM account_deletion_requests WHERE id = $1 FOR UPDATE",
        [requestId],
      );
      const userId = result.rows[0]?.user_id;
      const userIdHash = userId === undefined || userId === null
        ? null
        : createHash("sha256").update(userId).digest("hex");
      if (userId !== undefined && userId !== null) {
        const account = await client.query<{ email: string }>(
          "SELECT email FROM users WHERE id = $1 FOR UPDATE",
          [userId],
        );
        const email = account.rows[0]?.email;
        if (email !== undefined) {
          const pendingEvents = await client.query<{ pending: boolean }>(
            `SELECT EXISTS (
               SELECT 1 FROM outbox_events
               WHERE (aggregate_id = $1 OR payload->>'userId' = $1
                 OR payload->>'ownerId' = $1 OR payload->>'recipientId' = $1
                 OR payload->>'email' = $2)
                 AND published_at IS NULL
             ) AS pending`,
            [userId, email],
          );
          if (pendingEvents.rows[0]?.pending === true) {
            throw new Error("Account events are still pending delivery");
          }
          await client.query(
            `DELETE FROM notification_event_deliveries AS delivery
             USING outbox_events AS event
             WHERE delivery.event_id = event.id
               AND (event.aggregate_id = $1 OR event.payload->>'userId' = $1
                 OR event.payload->>'ownerId' = $1 OR event.payload->>'recipientId' = $1
                 OR event.payload->>'email' = $2)`,
            [userId, email],
          );
          await client.query(
            `DELETE FROM outbox_events
             WHERE aggregate_id = $1 OR payload->>'userId' = $1
               OR payload->>'ownerId' = $1 OR payload->>'recipientId' = $1
               OR payload->>'email' = $2`,
            [userId, email],
          );
        }
        await client.query("DELETE FROM users WHERE id = $1", [userId]);
      }
      await client.query(
        `UPDATE account_deletion_requests SET status = 'completed', user_id = NULL,
           current_step = 'account-cleanup', completed_at = CURRENT_TIMESTAMP,
           session_ids = '[]'::jsonb, user_id_hash = COALESCE(user_id_hash, $2),
           lease_owner = NULL, lease_expires_at = NULL, last_error = NULL
         WHERE id = $1`,
        [requestId, userIdHash],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async retry(requestId: string): Promise<void> {
    await database.query(
      `UPDATE account_deletion_requests SET status = 'pending',
         next_attempt_at = CURRENT_TIMESTAMP + LEAST(300, GREATEST(1, attempts)) * INTERVAL '1 second',
         lease_owner = NULL, lease_expires_at = NULL,
         last_error = 'deletion participant unavailable'
       WHERE id = $1 AND status = 'running'`,
      [requestId],
    );
  }
}