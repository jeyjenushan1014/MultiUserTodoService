import {
  database,
} from "../config/database.js";

import type {
  AppendTodoHistoryRequest,
  TodoHistoryRecord,
} from "./todo-history.types.js";

import type {
  TodoHistoryRepository,
} from "./todo-history.interface.js";

interface TodoHistoryDatabaseRow {
  readonly id: string;
  readonly event_id: string;
  readonly todo_id: string;
  readonly actor_id: string;
  readonly event_type:
    TodoHistoryRecord["eventType"];
  readonly request_id: string;
  readonly occurred_at: Date;
  readonly details:
    Record<string, unknown>;
}

function mapHistoryRow(
  row: TodoHistoryDatabaseRow,
): TodoHistoryRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    todoId: row.todo_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    requestId: row.request_id,
    occurredAt:
      row.occurred_at.toISOString(),
    details: row.details,
  };
}

export class PostgresTodoHistoryRepository
implements TodoHistoryRepository {
  public async append(
    request: AppendTodoHistoryRequest,
  ): Promise<boolean> {
    const result =
      await database.query(
        `
          INSERT INTO todo_history (
            event_id,
            todo_id,
            actor_id,
            event_type,
            request_id,
            occurred_at,
            details
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::jsonb
          )
          ON CONFLICT (event_id)
          DO NOTHING
        `,
        [
          request.eventId,
          request.todoId,
          request.actorId,
          request.eventType,
          request.requestId,
          request.occurredAt,
          JSON.stringify(
            request.details,
          ),
        ],
      );

    return result.rowCount === 1;
  }

  public async listAccessible(
    todoId: string,
    callerId: string,
  ): Promise<
    readonly TodoHistoryRecord[]
  > {
    const result =
      await database.query<
        TodoHistoryDatabaseRow
      >(
        `
          SELECT
            history.id,
            history.event_id,
            history.todo_id,
            history.actor_id,
            history.event_type,
            history.request_id,
            history.occurred_at,
            history.details
          FROM todo_history AS history
          WHERE history.todo_id = $1
            AND (
              EXISTS (
                SELECT 1
                FROM todos AS todo
                WHERE todo.id = history.todo_id
                  AND todo.owner_id = $2
              )
              OR EXISTS (
                SELECT 1
                FROM todo_shares AS share
                WHERE share.todo_id =
                  history.todo_id
                  AND share.recipient_id = $2
                  AND share.withdrawn_at IS NULL
              )
            )
          ORDER BY
            history.occurred_at ASC,
            history.id ASC
        `,
        [
          todoId,
          callerId,
        ],
      );

    return result.rows.map(
      mapHistoryRow,
    );
  }
}