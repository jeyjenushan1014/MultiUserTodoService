import type {
  TodoState,
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  UpdateTodoRepository,
} from "./update.todo.repository.interface.js";

interface StateOnlyUpdate
extends UpdateTodoRequest {
  readonly state:
    TodoState;
}

function isStateOnlyUpdate(
  changes:
    UpdateTodoRequest,
): changes is StateOnlyUpdate {
  return (
    changes.state !==
      undefined &&
    changes.title ===
      undefined &&
    changes.description ===
      undefined &&
    changes.dueDate ===
      undefined
  );
}

export class UpdateTodoService {
  public constructor(
    private readonly repository:
      UpdateTodoRepository,
  ) {}

  public async execute(
    callerId: string,
    todoId: string,
    changes:
      UpdateTodoRequest,
    requestId: string,
  ): Promise<
    UpdateTodoResponse
  > {
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
      isStateOnlyUpdate(changes)
        ? await this.repository
            .updateAccessibleTodoState(
              callerId,
              todoId,
              changes.state,
              requestId,
            )
        : await this.repository
            .updateOwnedTodo(
              callerId,
              todoId,
              changes,
              requestId,
            );

    switch (result.status) {
      case "updated":
        return result.todo;

      case "duplicate_title":
        throw new AppError(
          409,
          "TODO_TITLE_ALREADY_EXISTS",
          "An active TODO with this title already exists",
        );

      case "not_found":
      case "forbidden":
        throw new AppError(
          404,
          "TODO_NOT_FOUND",
          "TODO was not found",
        );
    }
  }
}