import type {
  UpdateTodoRequest,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

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
  readonly code?: unknown;
}

interface TodoAccessRow {
  readonly owner_id:
    string;

  readonly access_type:
    "owner" | "shared";
}

function isObject(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value === "object" &&
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

function isStateOnlyUpdate(
  changes:
    UpdateTodoRequest,
): boolean {
  const fields =
    Object.keys(changes);

  return (
    fields.length === 1 &&
    changes.state !== undefined
  );
}

export class PostgresUpdateTodoRepository
implements UpdateTodoRepository {
  public async updateOwnedTodo(
    ownerId: string,
    todoId: string,
    changes: UpdateTodoRequest,
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

    if (assignments.length === 0) {
      throw new Error(
        "At least one TODO field must be updated",
      );
    }

    const client =
      await database.connect();

    try {
      await client.query(
        "BEGIN",
      );

      /*
       * Lock the TODO before checking access.
       *
       * Part 10 share withdrawal must lock the same
       * TODO before withdrawing a share. This makes
       * state updates and withdrawals serialize.
       */
      const accessResult =
        await client.query<
          TodoAccessRow
        >(
          `
            SELECT
              todo.owner_id,

              CASE
                WHEN todo.owner_id = $2
                  THEN 'owner'
                ELSE 'shared'
              END AS access_type

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
            ownerId,
          ],
        );

      const access =
        accessResult.rows[0];

      if (access === undefined) {
        await client.query(
          "ROLLBACK",
        );

        return {
          status:
            "not_found",
        };
      }

      /*
       * A shared recipient may update only state.
       */
      if (
        access.access_type ===
          "shared" &&
        !isStateOnlyUpdate(
          changes,
        )
      ) {
        await client.query(
          "ROLLBACK",
        );

        return {
          status:
            "forbidden",
        };
      }

      values.push(
        todoId,
      );

      const todoIdPosition =
        values.length;

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

              AND deleted_at
                IS NULL

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

      const updatedRow =
        updateResult.rows[0];

      if (updatedRow === undefined) {
        await client.query(
          "ROLLBACK",
        );

        return {
          status:
            "not_found",
        };
      }

      await client.query(
        "COMMIT",
      );

      return {
        status:
          "updated",

        todo:
          mapTodoRow(
            updatedRow,
          ),
      };
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        /*
         * Preserve the original database failure.
         */
      }

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
}