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
     * Defence in depth for direct service calls that
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
       * Used for missing, cross-owner and deleted
       * TODOs to prevent resource enumeration.
       */
      throw new AppError(
        404,
        "TODO_NOT_FOUND",
        "TODO was not found",
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