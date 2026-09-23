import type {
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export interface UpdateTodoOperation {
  execute(
    ownerId: string,
    todoId: string,
    changes:
      UpdateTodoRequest,
  ): Promise<
    UpdateTodoResponse
  >;
}

export class CacheInvalidatingUpdateTodoService
implements UpdateTodoOperation {
  public constructor(
    private readonly operation:
      UpdateTodoOperation,

    private readonly invalidator:
      TodoCacheInvalidator,
  ) {}

  public async execute(
    ownerId: string,
    todoId: string,
    changes:
      UpdateTodoRequest,
  ): Promise<
    UpdateTodoResponse
  > {
    const result =
      await this.operation.execute(
        ownerId,
        todoId,
        changes,
      );

    await this.invalidator
      .invalidateOwner(
        ownerId,
      );

    return result;
  }
}