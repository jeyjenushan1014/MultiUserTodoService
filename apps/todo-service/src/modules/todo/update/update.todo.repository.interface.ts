import type {
  UpdateTodoRequest,
} from "@todo/contracts";

import type {
  UpdateTodoRepositoryResult,
} from "./update.todo.types.js";

export interface UpdateTodoRepository {
  updateOwnedTodo(
    ownerId: string,
    todoId: string,
    changes: UpdateTodoRequest,
  ): Promise<
    UpdateTodoRepositoryResult
  >;
}