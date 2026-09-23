import type {
  GetTodoResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  GetTodoRepository,
} from "./get.todo.repository.interface.js";

export class GetTodoService {
  public constructor(
    private readonly repository:
      GetTodoRepository,
  ) {}

  public async execute(
    ownerId: string,
    todoId: string,
  ): Promise<GetTodoResponse> {
    const todo =
      await this.repository
        .findOwnedTodoById(
          ownerId,
          todoId,
        );

    if (todo === undefined) {
      /*
       * The same error is used when:
       *
       * 1. The TODO does not exist.
       * 2. The TODO belongs to another owner.
       * 3. The TODO was soft-deleted.
       *
       * This prevents resource-enumeration attacks.
       */
      throw new AppError(
        404,
        "TODO_NOT_FOUND",
        "TODO was not found",
      );
    }

    return todo;
  }
}