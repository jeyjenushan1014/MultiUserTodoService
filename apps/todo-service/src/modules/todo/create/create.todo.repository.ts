import {
  database,
} from "../../../config/database.js";

import {
  mapTodoRow,
} from "../todo.mapper.js";

import type {
  CreateTodoRepositoryResult,
  TodoRepository,
} from "./create.todo.repository.interface.js";

import type {
  CreateTodoData,
  TodoDatabaseRow,
} from "../todo.types.js";

interface PostgreSqlError {
  readonly code?: unknown;

  readonly constraint?: unknown;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
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

function isDuplicateTitleError(
  error: unknown,
): boolean {
  if (
    !isPostgreSqlError(error)
  ) {
    return false;
  }

  return (
    error.code === "23505" &&
    error.constraint ===
      "uq_todos_owner_normalized_title_active"
  );
}

export class PostgresTodoRepository
implements TodoRepository {
  public async create(
    data: CreateTodoData,
  ): Promise<CreateTodoRepositoryResult> {
    try {
      const result =
        await database
          .query<TodoDatabaseRow>(
            `
              INSERT INTO todos (
                id,
                owner_id,
                title,
                description,
                state,
                due_date,
                created_at,
                updated_at
              )
              SELECT
                $1,
                todo_owners.id,
                $3,
                $4,
                $5,
                $6,
                $7,
                $7
              FROM todo_owners
              WHERE todo_owners.id = $2
                AND todo_owners.deactivated_at
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
            [
              data.id,
              data.ownerId,
              data.title,
              data.description,
              data.state,
              data.dueDate,
              data.occurredAt,
            ],
          );

      const row =
        result.rows[0];

      if (row === undefined) {
        return {
          outcome:
            "owner-unavailable",
        };
      }

      return {
        outcome:
          "created",

        todo:
          mapTodoRow(row),
      };
    } catch (error) {
      if (
        isDuplicateTitleError(
          error,
        )
      ) {
        return {
          outcome:
            "duplicate-title",
        };
      }

      throw error;
    }
  }
}