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
  CreateTodoRepositoryResult,
  IdempotentCreateTodoData,
  TodoRepository,
} from "./create.todo.repository.interface.js";

interface PostgreSqlError {
  readonly code?:
    unknown;

  readonly constraint?:
    unknown;
}

interface IdempotencyRecordRow {
  readonly request_hash:
    string;

  readonly todo_id:
    string;
}

interface InsertedIdempotencyRow {
  readonly todo_id:
    string;
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
      "Idempotent TODO creation rollback failed",
    );
  }
}

export class PostgresTodoRepository
implements TodoRepository {
  public async create(
    data:
      IdempotentCreateTodoData,
  ): Promise<
    CreateTodoRepositoryResult
  > {
    const client =
      await database.connect();

    try {
      await client.query(
        "BEGIN",
      );

      /*
       * This prevents expired idempotency records
       * from accumulating indefinitely.
       */
      await client.query(
        `
          DELETE FROM
            todo_idempotency_records
          WHERE expires_at <= $1
        `,
        [
          data.occurredAt,
        ],
      );

      /*
       * The primary key on owner_id and
       * idempotency_key serializes concurrent
       * requests using the same key.
       */
      const insertedRecord =
        await client.query<
          InsertedIdempotencyRow
        >(
          `
            INSERT INTO
              todo_idempotency_records (
                owner_id,
                idempotency_key,
                request_hash,
                todo_id,
                created_at,
                expires_at
              )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6
            )
            ON CONFLICT (
              owner_id,
              idempotency_key
            )
            DO NOTHING
            RETURNING
              todo_id
          `,
          [
            data.ownerId,
            data.idempotencyKey,
            data.requestHash,
            data.id,
            data.occurredAt,
            data.idempotencyExpiresAt,
          ],
        );

      const recordWasInserted =
        insertedRecord.rows[0] !==
        undefined;

      if (!recordWasInserted) {
        /*
         * INSERT ON CONFLICT waits for a concurrent
         * transaction using the same key. This SELECT
         * therefore observes the committed record.
         */
        const existingRecordResult =
          await client.query<
            IdempotencyRecordRow
          >(
            `
              SELECT
                request_hash,
                todo_id
              FROM
                todo_idempotency_records
              WHERE owner_id = $1
                AND idempotency_key = $2
              LIMIT 1
            `,
            [
              data.ownerId,
              data.idempotencyKey,
            ],
          );

        const existingRecord =
          existingRecordResult
            .rows[0];

        if (
          existingRecord ===
          undefined
        ) {
          throw new Error(
            "Idempotency record disappeared during TODO creation",
          );
        }

        if (
          existingRecord
            .request_hash !==
          data.requestHash
        ) {
          await client.query(
            "ROLLBACK",
          );

          return {
            outcome:
              "idempotency-key-reused",
          };
        }

        /*
         * Do not filter deleted_at here.
         *
         * An idempotent replay returns the result of
         * the original operation, even if another
         * operation later soft-deleted the TODO.
         */
        const existingTodoResult =
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
              WHERE id = $1
                AND owner_id = $2
              LIMIT 1
            `,
            [
              existingRecord.todo_id,
              data.ownerId,
            ],
          );

        const existingTodo =
          existingTodoResult.rows[0];

        if (
          existingTodo ===
          undefined
        ) {
          throw new Error(
            "Idempotency record references a missing TODO",
          );
        }

        await client.query(
          "COMMIT",
        );

        return {
          outcome:
            "replayed",

          todo:
            mapTodoRow(
              existingTodo,
            ),
        };
      }

      const createdTodoResult =
        await client.query<
          TodoDatabaseRow
        >(
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

      const createdTodo =
        createdTodoResult.rows[0];

      if (
        createdTodo ===
        undefined
      ) {
        await client.query(
          "ROLLBACK",
        );

        return {
          outcome:
            "owner-unavailable",
        };
      }

      await client.query(
        "COMMIT",
      );

      return {
        outcome:
          "created",

        todo:
          mapTodoRow(
            createdTodo,
          ),
      };
    } catch (error) {
      await rollbackTransaction(
        client,
      );

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
    } finally {
      client.release();
    }
  }
}