import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { database } from "../config/database.js";

export const ANONYMIZED_TODO_OWNER_ID = "00000000-0000-0000-0000-000000000000";

export class PostgresAccountDeletionRepository {
  public async eraseAccountData(userId: string, orphanedWorkspaceIds: readonly string[]): Promise<void> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const userIdHash = createHash("sha256").update(userId).digest("hex");
      await client.query(
        "INSERT INTO account_deletion_tombstones (user_id_hash) VALUES ($1) ON CONFLICT DO NOTHING",
        [userIdHash],
      );
      const owner = await client.query<{ email: string | null }>(
        "SELECT email FROM todo_owners WHERE id = $1 FOR UPDATE",
        [userId],
      );
      const email = owner.rows[0]?.email ?? null;

      await client.query(
        `INSERT INTO todo_owners (id, account_created_at, email)
         VALUES ($1, CURRENT_TIMESTAMP, NULL)
         ON CONFLICT (id) DO NOTHING`,
        [ANONYMIZED_TODO_OWNER_ID],
      );
      await client.query("DELETE FROM todo_shares WHERE recipient_id = $1", [userId]);
      if (orphanedWorkspaceIds.length > 0) {
        await client.query(
          "UPDATE todos SET workspace_id = NULL WHERE workspace_id = ANY($1::uuid[])",
          [orphanedWorkspaceIds],
        );
      }

      const removedTodos = await client.query<{ id: string }>(
        `DELETE FROM todos AS todo
         WHERE todo.owner_id = $1
           AND todo.workspace_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM todo_shares AS share
             WHERE share.todo_id = todo.id
               AND share.withdrawn_at IS NULL
               AND share.recipient_id <> $1
           )
         RETURNING todo.id`,
        [userId],
      );
      const removedTodoIds = removedTodos.rows.map((row) => row.id);
      if (removedTodoIds.length > 0) {
        await client.query("DELETE FROM todo_history WHERE todo_id = ANY($1::uuid[])", [removedTodoIds]);
        await client.query(
          "DELETE FROM outbox_events WHERE aggregate_type = 'todo' AND aggregate_id = ANY($1::uuid[])",
          [removedTodoIds],
        );
        await client.query("DELETE FROM chain_submissions WHERE task_id = ANY($1::uuid[])", [removedTodoIds]);
        await client.query("DELETE FROM task_chain_events WHERE task_id = ANY($1::uuid[])", [removedTodoIds]);
      }

      if (email !== null) {
        await client.query(
          `UPDATE todos
           SET title = CASE
                 WHEN POSITION(LOWER($2) IN LOWER(title)) > 0 THEN '[deleted account content]'
                 ELSE title
               END,
               description = CASE
                 WHEN description IS NOT NULL AND POSITION(LOWER($2) IN LOWER(description)) > 0 THEN NULL
                 ELSE description
               END
           WHERE owner_id = $1
             AND (POSITION(LOWER($2) IN LOWER(title)) > 0
               OR (description IS NOT NULL AND POSITION(LOWER($2) IN LOWER(description)) > 0))`,
          [userId, email],
        );
      }

      await client.query(
        "UPDATE todos SET owner_id = $2 WHERE owner_id = $1",
        [userId, ANONYMIZED_TODO_OWNER_ID],
      );
      await client.query(
        `UPDATE todo_history
         SET actor_id = $2,
             details = '{}'::jsonb
         WHERE actor_id = $1
            OR details::text LIKE '%' || $1 || '%'
            OR ($3::text IS NOT NULL AND details::text LIKE '%' || $3 || '%')`,
        [userId, ANONYMIZED_TODO_OWNER_ID, email],
      );
      await client.query(
        `UPDATE outbox_events
         SET payload = '{}'::jsonb
         WHERE payload::text LIKE '%' || $1 || '%'
            OR ($2::text IS NOT NULL AND payload::text LIKE '%' || $2 || '%')`,
        [userId, email],
      );
      await client.query("DELETE FROM todo_idempotency_records WHERE owner_id = $1", [userId]);
      await client.query("DELETE FROM workflow_reservations WHERE owner_id = $1", [userId]);
      await client.query("DELETE FROM todo_owner_pending_email_changes WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM todo_owner_projection_rebuild_members WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM todo_owners WHERE id = $1", [userId]);
      await client.query("COMMIT");
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}