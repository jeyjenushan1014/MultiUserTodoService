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
  mapTodoRow,
} from "../todo.mapper.js";

import type {
  TodoDatabaseRow,
} from "../todo.types.js";

import type {
  ListTodosRepository,
} from "./list-todos.repository.interface.js";

import type {
  ListTodosParameters,
  ListTodosRepositoryResult,
} from "./list-todos.types.js";

interface CountRow {
  readonly total_items:
    string;
}

function parseTotalItems(
  row: CountRow | undefined,
): number {
  if (row === undefined) {
    return 0;
  }

  const totalItems =
    Number.parseInt(
      row.total_items,
      10,
    );

  if (
    !Number.isSafeInteger(
      totalItems,
    ) ||
    totalItems < 0
  ) {
    throw new Error(
      "PostgreSQL returned an invalid TODO count",
    );
  }

  return totalItems;
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
      "TODO list transaction rollback failed",
    );
  }
}

export class PostgresListTodosRepository
implements ListTodosRepository {
  public async listTodos(
    parameters:
      ListTodosParameters,
  ): Promise<
    ListTodosRepositoryResult
  > {
    const client =
      await database.connect();

    const offset =
      (
        parameters.page - 1
      ) *
      parameters.pageSize;

    try {
      /*
       * The count and item queries use the same
       * database snapshot. This prevents inconsistent
       * pagination metadata during concurrent writes.
       */
      await client.query(
        `BEGIN
         ISOLATION LEVEL REPEATABLE READ
         READ ONLY`,
      );

      const countResult =
        await client.query<CountRow>(
          `
            SELECT
              COUNT(*)::text
                AS total_items
            FROM todos
            WHERE owner_id = $1
              AND deleted_at IS NULL
          `,
          [
            parameters.ownerId,
          ],
        );

      const todosResult =
        await client.query<
          TodoDatabaseRow
        >(
          `
            SELECT
              id,
              owner_id,
              title,
              description,
              state,
              due_date,
              created_at,
              updated_at
            FROM todos
            WHERE owner_id = $1
              AND deleted_at IS NULL
            ORDER BY
              created_at DESC,
              id DESC
            LIMIT $2
            OFFSET $3
          `,
          [
            parameters.ownerId,
            parameters.pageSize,
            offset,
          ],
        );

      await client.query(
        "COMMIT",
      );

      return {
        items:
          todosResult.rows.map(
            mapTodoRow,
          ),

        totalItems:
          parseTotalItems(
            countResult.rows[0],
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