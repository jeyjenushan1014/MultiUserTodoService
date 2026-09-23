import {
  AppError,
} from "@todo/common";

import type {
  DeleteTodoRepository,
} from "./delete.todo.repository.interface.js";

export class DeleteTodoService {
  public constructor(
    private readonly repository:
      DeleteTodoRepository,
  ) {}

  public async execute(
    ownerId: string,
    todoId: string,
  ): Promise<void> {
    const deleted =
      await this.repository
        .softDeleteOwnedTodo(
          ownerId,
          todoId,
        );

    if (!deleted) {
      /*
       * The same response is used when:
       *
       * 1. The TODO does not exist.
       * 2. The TODO belongs to another user.
       * 3. The TODO was already deleted.
       */
      throw new AppError(
        404,
        "TODO_NOT_FOUND",
        "TODO was not found",
      );
    }
  }
}