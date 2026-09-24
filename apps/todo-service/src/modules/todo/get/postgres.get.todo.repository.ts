import type {
  GetTodoResponse,
  TodoAccountReference,
  TodoState,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import type {
  FindAccessibleTodoParameters,
  GetTodoRepository,
} from "./get.todo.repository.interface.js";

interface AccessibleTodoRow {
  readonly id:
    string;

  readonly owner_id:
    string;

  readonly title:
    string;

  readonly description:
    string | null;

  readonly state:
    TodoState;

  readonly due_date:
    Date | null;

  readonly created_at:
    Date;

  readonly updated_at:
    Date;

  readonly access_type:
    "owner" | "shared";

  readonly owner_email:
    string;

  readonly shared_with:
    unknown;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function parseSharedAccount(
  value: unknown,
): TodoAccountReference {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.email !== "string"
  ) {
    throw new Error(
      "PostgreSQL returned an invalid shared account",
    );
  }

  return {
    id:
      value.id,

    email:
      value.email,
  };
}

function parseSharedAccounts(
  value: unknown,
): readonly TodoAccountReference[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "PostgreSQL returned an invalid shared account list",
    );
  }

  return value.map(
    parseSharedAccount,
  );
}

function mapAccessibleTodo(
  row: AccessibleTodoRow,
): GetTodoResponse {
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

export class PostgresGetTodoRepository
implements GetTodoRepository {
  public async findAccessibleById(
    parameters:
      FindAccessibleTodoParameters,
  ): Promise<
    GetTodoResponse | undefined
  > {
    const result =
      await database.query<
        AccessibleTodoRow
      >(
        `
          SELECT
            todo.id,
            todo.owner_id,
            todo.title,
            todo.description,
            todo.state,
            todo.due_date,
            todo.created_at,
            todo.updated_at,

            CASE
              WHEN todo.owner_id = $2
                THEN 'owner'
              ELSE 'shared'
            END AS access_type,

            owner_projection.email
              AS owner_email,

            COALESCE(
              jsonb_agg(
                DISTINCT jsonb_build_object(
                  'id',
                  recipient_projection.id,
                  'email',
                  recipient_projection.email
                )
              ) FILTER (
                WHERE active_share.id
                  IS NOT NULL
              ),
              '[]'::jsonb
            ) AS shared_with

          FROM todos AS todo

          INNER JOIN todo_owners
            AS owner_projection
            ON owner_projection.id =
              todo.owner_id

          LEFT JOIN todo_shares
            AS active_share
            ON active_share.todo_id =
              todo.id
            AND active_share.withdrawn_at
              IS NULL

          LEFT JOIN todo_owners
            AS recipient_projection
            ON recipient_projection.id =
              active_share.recipient_id

                    WHERE todo.id = $1
            AND todo.deleted_at
              IS NULL
            AND (
              todo.owner_id = $2

              OR EXISTS (
                SELECT 1
                FROM todo_shares
                  AS caller_share
                WHERE caller_share.todo_id =
                  todo.id
                  AND caller_share.recipient_id =
                    $2
                  AND caller_share.withdrawn_at
                    IS NULL
              )
            )

          GROUP BY
            todo.id,
            todo.owner_id,
            todo.title,
            todo.description,
            todo.state,
            todo.due_date,
            todo.created_at,
            todo.updated_at,
            owner_projection.email
        `,
        [
          parameters.todoId,
          parameters.callerId,
        ],
      );

    const row =
      result.rows[0];

    return row === undefined
      ? undefined
      : mapAccessibleTodo(
          row,
        );
  }
}