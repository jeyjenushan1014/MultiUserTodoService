import type {
  TodoResponse,
} from "@todo/contracts";

import type {
  GetTodoRepository,
} from "../get/get.todo.repository.interface.js";

import type {
  TodoReadCache,
} from "./todo.read.cache.interface.js";

export class CachedGetTodoRepository
implements GetTodoRepository {
  public constructor(
    private readonly repository:
      GetTodoRepository,

    private readonly readCache:
      TodoReadCache,
  ) {}

  public async findOwnedTodoById(
    ownerId: string,
    todoId: string,
  ): Promise<
    TodoResponse | undefined
  > {
    const lookup =
      await this.readCache
        .lookupItem(
          ownerId,
          todoId,
        );

    if (
      lookup?.value !==
      undefined
    ) {
      return lookup.value;
    }

    const todo =
      await this.repository
        .findOwnedTodoById(
          ownerId,
          todoId,
        );

    /*
     * Do not cache not-found results.
     *
     * This avoids negative-cache complications when a
     * resource is created or restored.
     */
    if (
      todo !== undefined &&
      lookup !== undefined
    ) {
      await this.readCache
        .storeItem(
          lookup.cacheKey,
          todo,
        );
    }

    return todo;
  }
}