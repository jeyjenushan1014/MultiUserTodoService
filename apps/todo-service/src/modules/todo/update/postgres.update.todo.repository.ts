import type {
  TodoState,
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

function mapUpdateResult(
  rows:
    readonly TodoDatabaseRow[],
): UpdateTodoRepositoryResult {
  const row =
    rows[0];

  if (row === undefined) {
    return {
      status:
        "not_found",
    };
  }

  return {
    status:
      "updated",

    todo:
      mapTodoRow(row),
  };
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

    try {
      const result =
        await database.query<
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

      return mapUpdateResult(
        result.rows,
      );
    } catch (error) {
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
    }
  }

  public async updateAccessibleTodoState(
    callerId: string,
    todoId: string,
    state: TodoState,
  ): Promise<
    UpdateTodoRepositoryResult
  > {
    const result =
      await database.query<
        TodoDatabaseRow
      >(
        `
          UPDATE todos AS todo
          SET
            state = $1,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE todo.id = $2
            AND todo.deleted_at
              IS NULL
            AND (
              todo.owner_id = $3

              OR EXISTS (
                SELECT 1
                FROM todo_shares
                  AS active_share
                WHERE active_share.todo_id =
                  todo.id
                  AND active_share.recipient_id =
                    $3
                  AND active_share.withdrawn_at
                    IS NULL
              )
            )
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
          callerId,
        ],
      );

    return mapUpdateResult(
      result.rows,
    );
  }
}