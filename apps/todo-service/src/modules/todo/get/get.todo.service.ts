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
    callerId: string,
    todoId: string,
  ): Promise<GetTodoResponse> {
    const todo =
      await this.repository
        .findAccessibleById({
          callerId,
          todoId,
        });

    /*
     * The response is intentionally identical for:
     *
     * 1. A missing TODO.
     * 2. A TODO belonging to another user.
     * 3. A TODO not shared with the caller.
     *
     * This prevents resource enumeration.
     */
    if (todo === undefined) {
      throw new AppError(
        404,
        "TODO_NOT_FOUND",
        "TODO was not found",
      );
    }

    return todo;
  }
}