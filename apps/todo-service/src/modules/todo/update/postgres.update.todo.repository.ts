import type {
  PoolClient,
} from "pg";

import type {
  TodoState,
  UpdateTodoRequest,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import {
  logger,
} from "../../../config/logger.js";

import {
  createTodoCompletedEvent,
} from "../../../events/todo-event.factory.js";

import {
  PostgresTodoOutboxWriter,
} from "../../../outbox/postgres.todo-outbox.writer.js";

import type {
  TodoOutboxWriter,
} from "../../../outbox/todo-outbox.writer.interface.js";

import {
  mapTodoRow,
} from "../todo.mapper.js";

import type {
  TodoDatabaseRow,
} from "../todo.types.js";

import type {
  UpdateTodoRepository,
} from "./update.todo.repository.interface.js";

import type {
  UpdateTodoRepositoryResult,
} from "./update.todo.types.js";

interface PostgreSqlError {
  readonly code?:
    unknown;
}

interface CurrentTodoRow {
  readonly owner_id:
    string;

  readonly state:
    TodoState;
}

function isObject(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null
  );
}

function isPostgreSqlError(
  error: unknown,
): error is PostgreSqlError {
  return isObject(error);
}

function isUniqueConstraintViolation(
  error: unknown,
): boolean {
  return (
    isPostgreSqlError(error) &&
    error.code === "23505"
  );
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
      "TODO update rollback failed",
    );
  }
}

export class PostgresUpdateTodoRepository
implements UpdateTodoRepository {
  public constructor(
    private readonly outboxWriter:
      TodoOutboxWriter =
        new PostgresTodoOutboxWriter(),
  ) {}

  private async appendCompletedEvent(
    client: PoolClient,
    previousState: TodoState,
    updatedTodo:
      TodoDatabaseRow,
    completedByUserId: string,
    requestId: string,
  ): Promise<void> {
    if (
      previousState ===
        "completed" ||
      updatedTodo.state !==
        "completed"
    ) {
      return;
    }

    const event =
      createTodoCompletedEvent(
        {
          todoId:
            updatedTodo.id,

          ownerId:
            updatedTodo.owner_id,

          completedByUserId,
        },
        requestId,
      );

    await this.outboxWriter
      .append(
        client,
        event,
      );
  }

  public async updateOwnedTodo(
    ownerId: string,
    todoId: string,
    changes:
      UpdateTodoRequest,
    requestId: string,
  ): Promise<
    UpdateTodoRepositoryResult
  > {
    const assignments:
      string[] = [];

    const values:
      (
        | string
        | null
      )[] = [];

    if (
      changes.title !==
      undefined
    ) {
      values.push(
        changes.title,
      );

      assignments.push(
        `title = $${values.length}`,
      );
    }

    if (
      changes.description !==
      undefined
    ) {
      values.push(
        changes.description,
      );

      assignments.push(
        `description = $${values.length}`,
      );
    }

    if (
      changes.state !==
      undefined
    ) {
      values.push(
        changes.state,
      );

      assignments.push(
        `state = $${values.length}`,
      );
    }

    if (
      changes.dueDate !==
      undefined
    ) {
      values.push(
        changes.dueDate,
      );

      assignments.push(
        `due_date = $${values.length}`,
      );
    }

    if (
      assignments.length === 0
    ) {
      throw new Error(
        "At least one TODO field must be updated",
      );
    }

    values.push(
      todoId,
    );

    const todoIdPosition =
      values.length;

    values.push(
      ownerId,
    );

    const ownerIdPosition =
      values.length;

    const client =
      await database.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const currentResult =
        await client.query<
          CurrentTodoRow
        >(
          `
            SELECT
              owner_id,
              state
            FROM todos
            WHERE id = $1
              AND owner_id = $2
              AND deleted_at IS NULL
            FOR UPDATE
          `,
          [
            todoId,
            ownerId,
          ],
        );

      const currentTodo =
        currentResult.rows[0];

      if (
        currentTodo ===
        undefined
      ) {
        await client.query(
          "ROLLBACK",
        );

        return {
          status:
            "not_found",
        };
      }

      const updateResult =
        await client.query<
          TodoDatabaseRow
        >(
          `
            UPDATE todos
            SET
              ${assignments.join(",\n")},
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id =
              $${todoIdPosition}
              AND owner_id =
                $${ownerIdPosition}
              AND deleted_at IS NULL
            RETURNING
              id,
              owner_id,
              title,
              description,
              state,
              due_date,
              created_at,
              updated_at
          `,
          values,
        );

      const updatedTodo =
        updateResult.rows[0];

      if (
        updatedTodo ===
        undefined
      ) {
        throw new Error(
          "Locked TODO disappeared during update",
        );
      }

      await this.appendCompletedEvent(
        client,
        currentTodo.state,
        updatedTodo,
        ownerId,
        requestId,
      );

      await client.query(
        "COMMIT",
      );

      return {
        status:
          "updated",

        todo:
          mapTodoRow(
            updatedTodo,
          ),
      };
    } catch (error) {
      await rollbackTransaction(
        client,
      );

      if (
        isUniqueConstraintViolation(
          error,
        )
      ) {
        return {
          status:
            "duplicate_title",
        };
      }

      throw error;
    } finally {
      client.release();
    }
  }

  public async updateAccessibleTodoState(
    callerId: string,
    todoId: string,
    state: TodoState,
    requestId: string,
  ): Promise<
    UpdateTodoRepositoryResult
  > {
    const client =
      await database.connect();

    try {
      await client.query(
        "BEGIN",
      );

      /*
       * Locking the TODO row also coordinates with
       * share withdrawal, which locks this row first.
       */
      const currentResult =
        await client.query<
          CurrentTodoRow
        >(
          `
            SELECT
              todo.owner_id,
              todo.state
            FROM todos AS todo
            WHERE todo.id = $1
              AND todo.deleted_at
                IS NULL
              AND (
                todo.owner_id = $2

                OR EXISTS (
                  SELECT 1
                  FROM todo_shares
                    AS active_share
                  WHERE active_share.todo_id =
                    todo.id
                    AND active_share.recipient_id =
                      $2
                    AND active_share.withdrawn_at
                      IS NULL
                )
              )
            FOR UPDATE OF todo
          `,
          [
            todoId,
            callerId,
          ],
        );

      const currentTodo =
        currentResult.rows[0];

      if (
        currentTodo ===
        undefined
      ) {
        await client.query(
          "ROLLBACK",
        );

        return {
          status:
            "not_found",
        };
      }

      const updateResult =
        await client.query<
          TodoDatabaseRow
        >(
          `
            UPDATE todos
            SET
              state = $1,
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = $2
              AND deleted_at IS NULL
            RETURNING
              id,
              owner_id,
              title,
              description,
              state,
              due_date,
              created_at,
              updated_at
          `,
          [
            state,
            todoId,
          ],
        );

      const updatedTodo =
        updateResult.rows[0];

      if (
        updatedTodo ===
        undefined
      ) {
        throw new Error(
          "Locked TODO disappeared during state update",
        );
      }

      await this.appendCompletedEvent(
        client,
        currentTodo.state,
        updatedTodo,
        callerId,
        requestId,
      );

      await client.query(
        "COMMIT",
      );

      return {
        status:
          "updated",

        todo:
          mapTodoRow(
            updatedTodo,
          ),
      };
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