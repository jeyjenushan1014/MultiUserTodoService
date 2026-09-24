import type {
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export interface UpdateTodoOperation {
  execute(
    callerId: string,
    todoId: string,
    changes:
      UpdateTodoRequest,
    requestId: string,
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
    callerId: string,
    todoId: string,
    changes:
      UpdateTodoRequest,
    requestId: string,
  ): Promise<
    UpdateTodoResponse
  > {
    const result =
      await this.operation.execute(
        callerId,
        todoId,
        changes,
        requestId,
      );

    await this.invalidator
      .invalidateOwner(
        result.ownerId,
      );

    return result;
  }
}