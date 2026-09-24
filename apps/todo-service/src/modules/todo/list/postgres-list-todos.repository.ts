import type {
  PoolClient,
} from "pg";

import type {
  SortOrder,
  TodoAccountReference,
  TodoDetails,
  TodoListAccessType,
  TodoSortField,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import {
  logger,
} from "../../../config/logger.js";

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

interface SharedAccountRow {
  readonly id:
    string;

  readonly email:
    string;
}

interface ListTodoRow {
  readonly id:
    string;

  readonly owner_id:
    string;

  readonly owner_email:
    string;

  readonly title:
    string;

  readonly description:
    string | null;

  readonly state:
    TodoDetails["state"];

  readonly due_date:
    Date | null;

  readonly created_at:
    Date;

  readonly updated_at:
    Date;

  readonly access_type:
    TodoDetails["accessType"];

  readonly shared_with:
    unknown;
}

type OrderKey =
  `${TodoSortField}:${SortOrder}`;

const ORDER_BY_CLAUSES:
  Readonly<
    Record<OrderKey, string>
  > = {
    "createdAt:asc":
      `t.created_at ASC,
       t.id ASC`,

    "createdAt:desc":
      `t.created_at DESC,
       t.id DESC`,

    "dueDate:asc":
      `t.due_date ASC NULLS LAST,
       t.created_at DESC,
       t.id DESC`,

    "dueDate:desc":
      `t.due_date DESC NULLS LAST,
       t.created_at DESC,
       t.id DESC`,
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

function getAccessCondition(
  access:
    TodoListAccessType,
): string {
  switch (access) {
    case "owned":
      return "t.owner_id = $1";

    case "shared":
      return `
        EXISTS (
          SELECT 1
          FROM todo_shares access_share
          WHERE access_share.todo_id = t.id
            AND access_share.recipient_id = $1
            AND access_share.withdrawn_at IS NULL
        )
      `;

    case "all":
      return `
        (
          t.owner_id = $1
          OR EXISTS (
            SELECT 1
            FROM todo_shares access_share
            WHERE access_share.todo_id = t.id
              AND access_share.recipient_id = $1
              AND access_share.withdrawn_at IS NULL
          )
        )
      `;
  }
}

function parseTotalItems(
  row:
    CountRow | undefined,
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

function isRecord(
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

function parseSharedAccounts(
  value: unknown,
): readonly TodoAccountReference[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "PostgreSQL returned invalid shared account information",
    );
  }

  return value.map(
    (
      account,
    ): TodoAccountReference => {
      if (
        !isRecord(account) ||
        typeof account.id !==
          "string" ||
        typeof account.email !==
          "string"
      ) {
        throw new Error(
          "PostgreSQL returned invalid shared account information",
        );
      }

      return {
        id:
          account.id,

        email:
          account.email,
      };
    },
  );
}

function mapListTodoRow(
  row: ListTodoRow,
): TodoDetails {
  return {
    id:
      row.id,

    ownerId:
      row.owner_id,

    title:
      row.title,

    description:
      row.description,

    state:
      row.state,

    dueDate:
      row.due_date
        ?.toISOString() ??
      null,

    createdAt:
      row.created_at
        .toISOString(),

    updatedAt:
      row.updated_at
        .toISOString(),

    accessType:
      row.access_type,

    owner: {
      id:
        row.owner_id,

      email:
        row.owner_email,
    },

    sharedWith:
      parseSharedAccounts(
        row.shared_with,
      ),
  };
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

    const accessCondition =
      getAccessCondition(
        parameters.access,
      );

    const stateCondition =
      parameters.state ===
      undefined
        ? ""
        : "AND t.state = $2";

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
            FROM todos t
            WHERE t.deleted_at IS NULL
              AND ${accessCondition}
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
          ListTodoRow
        >(
          `
            SELECT
              t.id,
              t.owner_id,
              owner_projection.email
                AS owner_email,
              t.title,
              t.description,
              t.state,
              t.due_date,
              t.created_at,
              t.updated_at,

              CASE
                WHEN t.owner_id = $1
                  THEN 'owner'
                ELSE 'shared'
              END AS access_type,

              COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id',
                      recipient_projection.user_id,
                      'email',
                      recipient_projection.email
                    )
                    ORDER BY
                      recipient_projection.email ASC
                  )
                  FROM todo_shares visible_share
                  INNER JOIN todo_owners
                    recipient_projection
                    ON recipient_projection.user_id =
                      visible_share.recipient_id
                  WHERE visible_share.todo_id =
                    t.id
                    AND visible_share.withdrawn_at
                      IS NULL
                    AND (
                      t.owner_id = $1
                      OR visible_share.recipient_id =
                        $1
                    )
                ),
                '[]'::jsonb
              ) AS shared_with

            FROM todos t

            INNER JOIN todo_owners
              owner_projection
              ON owner_projection.user_id =
                t.owner_id

            WHERE t.deleted_at IS NULL
              AND ${accessCondition}
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
            mapListTodoRow,
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