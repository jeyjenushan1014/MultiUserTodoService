import type {
  PoolClient,
} from "pg";

import {
  database,
} from "../../../../config/database.js";

import {
  logger,
} from "../../../../config/logger.js";

import {
  createTodoShareWithdrawnEvent,
} from "../../../../events/todo-event.factory.js";

import {
  PostgresTodoOutboxWriter,
} from "../../../../outbox/postgres.todo-outbox.writer.js";

import type {
  TodoOutboxWriter,
} from "../../../../outbox/todo-outbox.writer.interface.js";

import type {
  WithdrawTodoShareRepository,
} from "./withdraw.todo.share.repository.interface.js";

import type {
  WithdrawTodoShareData,
  WithdrawTodoShareRepositoryResult,
} from "./withdraw.todo.share.types.js";

interface TodoOwnerRow {
  readonly owner_id:
    string;
}

interface WithdrawnShareRow {
  readonly id:
    string;

  readonly todo_id:
    string;

  readonly owner_id:
    string;

  readonly recipient_id:
    string;
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
      "TODO share withdrawal rollback failed",
    );
  }
}

export class PostgresWithdrawTodoShareRepository
implements WithdrawTodoShareRepository {
  public constructor(
    private readonly outboxWriter:
      TodoOutboxWriter =
        new PostgresTodoOutboxWriter(),
  ) {}

  public async withdraw(
    data:
      WithdrawTodoShareData,
  ): Promise<
    WithdrawTodoShareRepositoryResult
  > {
    const client =
      await database.connect();

    try {
      await client.query(
        "BEGIN",
      );

      /*
       * Lock the TODO row first.
       *
       * State updates performed by share recipients
       * lock the same row. Therefore, state updates
       * and share withdrawals cannot race while
       * checking authorization.
       */
      const todoResult =
        await client.query<
          TodoOwnerRow
        >(
          `
            SELECT
              owner_id

            FROM todos

            WHERE id = $1
              AND owner_id = $2
              AND deleted_at
                IS NULL

            FOR UPDATE
          `,
          [
            data.todoId,
            data.ownerId,
          ],
        );

      const todo =
        todoResult.rows[0];

      /*
       * Missing, deleted and cross-owner TODOs all
       * return the same result.
       */
      if (todo === undefined) {
        await client.query(
          "ROLLBACK",
        );

        return {
          status:
            "not_found",
        };
      }

      const shareResult =
        await client.query<
          WithdrawnShareRow
        >(
          `
            UPDATE todo_shares

            SET
              withdrawn_at = $4

            WHERE todo_id = $1
              AND owner_id = $2
              AND recipient_id = $3
              AND withdrawn_at
                IS NULL

            RETURNING
              id,
              todo_id,
              owner_id,
              recipient_id
          `,
          [
            data.todoId,
            data.ownerId,
            data.recipientId,
            data.withdrawnAt,
          ],
        );

      const share =
        shareResult.rows[0];

      /*
       * This covers:
       *
       * - share does not exist;
       * - share was already withdrawn;
       * - recipient does not match.
       */
      if (share === undefined) {
        await client.query(
          "ROLLBACK",
        );

        return {
          status:
            "not_found",
        };
      }

      const event =
        createTodoShareWithdrawnEvent(
          {
            shareId:
              share.id,

            todoId:
              share.todo_id,

            ownerId:
              share.owner_id,

            recipientId:
              share.recipient_id,
          },
          data.requestId,
        );

      /*
       * The share withdrawal and the outbox insert
       * use the same PoolClient and transaction.
       */
      await this.outboxWriter
        .append(
          client,
          event,
        );

      await client.query(
        "COMMIT",
      );

      return {
        status:
          "withdrawn",

        ownerId:
          share.owner_id,
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