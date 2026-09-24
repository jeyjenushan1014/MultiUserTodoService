import type {
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import type {
  UpdateTodoService,
} from "../update/update.todo.service.js";

import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export class CacheInvalidatingUpdateTodoService {
  public constructor(
    private readonly service:
      UpdateTodoService,

    private readonly cacheInvalidator:
      TodoCacheInvalidator,
  ) {}

  public async execute(
    ownerId: string,
    todoId: string,
    changes: UpdateTodoRequest,
  ): Promise<
    UpdateTodoResponse
  > {
    const todo =
      await this.service.execute(
        ownerId,
        todoId,
        changes,
      );

    /*
     * Use the actual resource owner.
     *
     * When a shared recipient updates the state,
     * ownerId contains the recipient's caller ID,
     * while todo.ownerId contains the real owner.
     */
    await this.cacheInvalidator
      .invalidateOwner(
        todo.ownerId,
      );

    return todo;
  }
}