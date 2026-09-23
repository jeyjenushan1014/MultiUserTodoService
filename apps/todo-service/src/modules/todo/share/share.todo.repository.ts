import type {
  QueryResult,
} from "pg";

import {
  database,
} from "../../../config/database.js";

import type {
  CreateTodoShareData,
  CreateTodoShareResult,
  ShareTodoRepository,
} from "./share.todo.repository.interface.js";

interface ShareTodoRow {
  readonly outcome:
    "created" |
    "duplicate";

  readonly id:
    string | null;

  readonly todo_id:
    string | null;

  readonly owner_id:
    string | null;

  readonly recipient_id:
    string | null;

  readonly permission:
    "state-update" | null;

  readonly shared_at:
    Date | null;
}

export class PostgresShareTodoRepository
implements ShareTodoRepository {
  public async create(
    data:
      CreateTodoShareData,
  ): Promise<
    CreateTodoShareResult
  > {
    /*
     * The CTE safely distinguishes:
     *
     * - TODO not found/cross-owner;
     * - duplicate active share;
     * - successfully created share.
     *
     * The partial unique index also protects
     * concurrent duplicate requests.
     */
    const result:
      QueryResult<
        ShareTodoRow
      > =
      await database.query<
        ShareTodoRow
      >(
        `
          WITH owned_todo AS (
            SELECT
              id,
              owner_id
            FROM todos
            WHERE id = $1
              AND owner_id = $2
          ),
          inserted_share AS (
            INSERT INTO todo_shares (
              id,
              todo_id,
              owner_id,
              recipient_id,
              permission,
              created_by_request_id,
              shared_at
            )
            SELECT
              $3,
              owned_todo.id,
              owned_todo.owner_id,
              $4,
              $5,
              $6,
              $7
            FROM owned_todo
            ON CONFLICT (
              todo_id,
              recipient_id
            )
            WHERE withdrawn_at IS NULL
            DO NOTHING
            RETURNING
              id,
              todo_id,
              owner_id,
              recipient_id,
              permission,
              shared_at
          )
          SELECT
            'created'::text AS outcome,
            id,
            todo_id,
            owner_id,
            recipient_id,
            permission,
            shared_at
          FROM inserted_share

          UNION ALL

          SELECT
            'duplicate'::text AS outcome,
            NULL::uuid AS id,
            NULL::uuid AS todo_id,
            NULL::uuid AS owner_id,
            NULL::uuid AS recipient_id,
            NULL::varchar AS permission,
            NULL::timestamptz AS shared_at
          FROM owned_todo
          WHERE NOT EXISTS (
            SELECT 1
            FROM inserted_share
          )
          LIMIT 1
        `,
        [
          data.todoId,
          data.ownerId,
          data.id,
          data.recipientId,
          data.permission,
          data.requestId,
          data.sharedAt,
        ],
      );

    const row =
      result.rows[0];

    /*
     * No owned_todo row means the TODO does not
     * exist or belongs to another owner.
     */
    if (
      row === undefined
    ) {
      return {
        outcome:
          "todo-not-found",
      };
    }

    if (
      row.outcome ===
      "duplicate"
    ) {
      return {
        outcome:
          "duplicate",
      };
    }

    if (
      row.id === null ||
      row.todo_id === null ||
      row.owner_id === null ||
      row.recipient_id === null ||
      row.permission === null ||
      row.shared_at === null
    ) {
      throw new Error(
        "PostgreSQL returned an invalid TODO share row",
      );
    }

    return {
      outcome:
        "created",

      share: {
        id:
          row.id,

        todoId:
          row.todo_id,

        ownerId:
          row.owner_id,

        recipientId:
          row.recipient_id,

        permission:
          row.permission,

        sharedAt:
          row.shared_at
            .toISOString(),
      },
    };
  }
}