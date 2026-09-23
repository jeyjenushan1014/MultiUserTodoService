import {
  database,
} from "../../../config/database.js";

import {
  mapTodoRow,
} from "../todo.mapper.js";

import type {
  TodoDatabaseRow,
} from "../todo.types.js";

import type {
  GetTodoRepository,
} from "./get.todo.repository.interface.js";

export class PostgresGetTodoRepository
implements GetTodoRepository {
  public async findOwnedTodoById(
    ownerId: string,
    todoId: string,
  ): Promise<
    ReturnType<
      typeof mapTodoRow
    > | undefined
  > {
    const result =
      await database.query<
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
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [
          todoId,
          ownerId,
        ],
      );

    const row =
      result.rows[0];

    if (row === undefined) {
      return undefined;
    }

    return mapTodoRow(
      row,
    );
  }
}