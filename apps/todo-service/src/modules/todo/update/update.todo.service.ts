import type {
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  UpdateTodoRepository,
} from "./update.todo.repository.interface.js";

export class UpdateTodoService {
  public constructor(
    private readonly repository:
      UpdateTodoRepository,
  ) {}

  public async execute(
    ownerId: string,
    todoId: string,
    changes: UpdateTodoRequest,
  ): Promise<
    UpdateTodoResponse
  > {
    /*
     * Defence in depth for service calls that
     * bypass HTTP validation.
     */
    if (
      Object.keys(changes)
        .length === 0
    ) {
      throw new AppError(
        400,
        "EMPTY_UPDATE",
        "At least one TODO field must be provided",
      );
    }

    const result =
      await this.repository
        .updateOwnedTodo(
          ownerId,
          todoId,
          changes,
        );

    if (
      result.status ===
      "not_found"
    ) {
      /*
       * Missing, unrelated and withdrawn-share
       * cases intentionally use the same response.
       */
      throw new AppError(
        404,
        "TODO_NOT_FOUND",
        "TODO was not found",
      );
    }

    if (
      result.status ===
      "forbidden"
    ) {
      throw new AppError(
        403,
        "SHARED_TODO_UPDATE_FORBIDDEN",
        "A shared TODO recipient may update only the state",
      );
    }

    if (
      result.status ===
      "duplicate_title"
    ) {
      throw new AppError(
        409,
        "TODO_TITLE_ALREADY_EXISTS",
        "An active TODO with this title already exists",
      );
    }

    return result.todo;
  }
}