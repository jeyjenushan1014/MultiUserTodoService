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

    /*
     * State-only updates are accessible to:
     * - the TODO owner
     * - an active share recipient
     *
     * Changes to title, description or due date
     * remain owner-only.
     */
    const result =
      isStateOnlyUpdate(changes)
        ? await this.repository
            .updateAccessibleTodoState(
              callerId,
              todoId,
              changes.state,
            )
        : await this.repository
            .updateOwnedTodo(
              callerId,
              todoId,
              changes,
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
        /*
         * Both cases return the same 404 response.
         * This prevents another user from discovering
         * whether the TODO exists.
         */
        throw new AppError(
          404,
          "TODO_NOT_FOUND",
          "TODO was not found",
        );
    }
  }
}