import {
  database,
} from "../../../../config/database.js";

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
  readonly owner_id:
    string;
}

export class PostgresWithdrawTodoShareRepository
implements WithdrawTodoShareRepository {
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
       * Shared-recipient updates lock the same row,
       * so update and withdrawal cannot change
       * authorization concurrently.
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
       * Missing TODO and non-owner callers receive
       * the same result.
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
              owner_id
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

      if (share === undefined) {
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
          "withdrawn",

        ownerId:
          share.owner_id,
      };
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        /*
         * Preserve the original database error.
         */
      }

      throw error;
    } finally {
      client.release();
    }
  }
}