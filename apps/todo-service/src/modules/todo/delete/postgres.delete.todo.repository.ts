import type {
  PoolClient,
} from "pg";

import {
  database,
} from "../../../config/database.js";

import {
  logger,
} from "../../../config/logger.js";

import {
  createTodoDeletedEvent,
} from "../../../events/todo-event.factory.js";

import {
  PostgresTodoOutboxWriter,
} from "../../../outbox/postgres.todo-outbox.writer.js";

import type {
  TodoOutboxWriter,
} from "../../../outbox/todo-outbox.writer.interface.js";

import {
  DEFAULT_PERSONAL_WORKSPACE_ID,
  PostgresChainSubmissionWriter,
  type ChainSubmissionWriter,
} from "../../../blockchain/chain-submission.writer.js";

import type {
  DeleteTodoRepository,
} from "./delete.todo.repository.interface.js";

interface DeletedTodoRow {
  readonly id:
    string;

  readonly owner_id:
    string;

  readonly workspace_id?:
    string | null;
}

async function rollbackTransaction(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch (rollbackError) {
    logger.error(
      {
        error:
          rollbackError,
      },
      "TODO deletion transaction rollback failed",
    );
  }
}

export class PostgresDeleteTodoRepository
implements DeleteTodoRepository {
  public constructor(
    private readonly outboxWriter:
      TodoOutboxWriter =
        new PostgresTodoOutboxWriter(),
    private readonly chainSubmissionWriter:
      ChainSubmissionWriter =
        new PostgresChainSubmissionWriter(),
  ) {}

  public async softDeleteOwnedTodo(
    ownerId: string,
    todoId: string,
    requestId: string,
  ): Promise<boolean> {
    const client =
      await database.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const result =
        await client.query<
          DeletedTodoRow
        >(
          `
            UPDATE todos

            SET
              deleted_at =
                CURRENT_TIMESTAMP,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = $1
              AND owner_id = $2
              AND deleted_at
                IS NULL

            RETURNING
              id,
              owner_id,
              workspace_id
          `,
          [
            todoId,
            ownerId,
          ],
        );

      const deletedTodo =
        result.rows[0];

      /*
       * This includes missing, cross-owner and
       * already-deleted TODOs.
       */
      if (
        deletedTodo ===
        undefined
      ) {
        await client.query(
          "ROLLBACK",
        );

        return false;
      }

      const event =
        createTodoDeletedEvent(
          {
            todoId:
              deletedTodo.id,

            ownerId:
              deletedTodo.owner_id,

            deletedByUserId:
              ownerId,
          },
          requestId,
        );

      /*
       * The soft deletion and outbox event use the
       * same PostgreSQL transaction.
       */
      await this.outboxWriter
        .append(
          client,
          event,
        );

      // BC-1: Anchor task deletion into durable chain submissions
      await this.chainSubmissionWriter.enqueue(
        client,
        {
          sourceEventId: event.eventId,
          taskId: deletedTodo.id,
          workspaceId: deletedTodo.workspace_id ?? DEFAULT_PERSONAL_WORKSPACE_ID,
          action: "deleted",
        },
      );

      await client.query(
        "COMMIT",
      );

      return true;
    } catch (error) {
      await rollbackTransaction(
        client,
      );

      throw error;
    } finally {
      client.release();
    }
  }
}