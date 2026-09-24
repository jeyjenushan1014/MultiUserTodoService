import type {
  TodoState,
  UpdateTodoRequest,
} from "@todo/contracts";

import type {
  UpdateTodoRepositoryResult,
} from "./update.todo.types.js";

export interface UpdateTodoRepository {
  updateOwnedTodo(
    ownerId: string,
    todoId: string,
    changes:
      UpdateTodoRequest,
    requestId: string,
  ): Promise<
    UpdateTodoRepositoryResult
  >;

  updateAccessibleTodoState(
    callerId: string,
    todoId: string,
    state: TodoState,
    requestId: string,
  ): Promise<
    UpdateTodoRepositoryResult
  >;
}