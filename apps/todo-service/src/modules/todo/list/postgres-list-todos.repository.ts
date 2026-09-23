import type {
  PoolClient,
} from "pg";

import type {
  SortOrder,
  TodoSortField,
} from "@todo/contracts";

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

type OrderKey =
  `${TodoSortField}:${SortOrder}`;

/*
 * User input is never inserted directly into SQL.
 *
 * The validated sort field and direction select one
 * complete SQL fragment from this application-owned
 * allow list.
 */
const ORDER_BY_CLAUSES:
  Readonly<
    Record<OrderKey, string>
  > = {
    "createdAt:asc":
      `created_at ASC,
       id ASC`,

    "createdAt:desc":
      `created_at DESC,
       id DESC`,

    "dueDate:asc":
      `due_date ASC NULLS LAST,
       created_at DESC,
       id DESC`,

    "dueDate:desc":
      `due_date DESC NULLS LAST,
       created_at DESC,
       id DESC`,
  };

function getOrderByClause(
  sortBy: TodoSortField,
  sortOrder: SortOrder,
): string {
  const key:
    OrderKey =
    `${sortBy}:${sortOrder}`;

  return ORDER_BY_CLAUSES[key];
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

    /*
     * Only fixed application-owned SQL is used.
     * The state value remains a PostgreSQL parameter.
     */
    const stateCondition =
      parameters.state === undefined
        ? ""
        : "AND state = $2";

    const filterValues:
      (string | number)[] = [
        parameters.ownerId,
      ];

    if (
      parameters.state !==
      undefined
    ) {
      filterValues.push(
        parameters.state,
      );
    }

    const limitParameterPosition =
      filterValues.length + 1;

    const offsetParameterPosition =
      filterValues.length + 2;

    const orderByClause =
      getOrderByClause(
        parameters.sortBy,
        parameters.sortOrder,
      );

    try {
      await client.query(
        `BEGIN TRANSACTION
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
              ${stateCondition}
          `,
          filterValues,
        );

      const listValues:
        (string | number)[] = [
          ...filterValues,
          parameters.pageSize,
          offset,
        ];

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
              ${stateCondition}
            ORDER BY
              ${orderByClause}
            LIMIT
              $${limitParameterPosition}
            OFFSET
              $${offsetParameterPosition}
          `,
          listValues,
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