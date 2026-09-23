import {
  database,
} from "../../../config/database.js";

import type {
  DeleteTodoRepository,
} from "./delete.todo.repository.interface.js";

interface DeletedTodoRow {
  readonly id: string;
}

export class PostgresDeleteTodoRepository
implements DeleteTodoRepository {
  public async softDeleteOwnedTodo(
    ownerId: string,
    todoId: string,
  ): Promise<boolean> {
    const result =
      await database.query<
        DeletedTodoRow
      >(
        `
          UPDATE todos
          SET
            deleted_at =
              CURRENT_TIMESTAMP,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $1
            AND owner_id = $2
            AND deleted_at IS NULL
          RETURNING id
        `,
        [
          todoId,
          ownerId,
        ],
      );

    return (
      result.rows[0] !==
      undefined
    );
  }
}