import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export interface DeleteTodoOperation {
  execute(
    ownerId: string,
    todoId: string,
    requestId: string,
  ): Promise<void>;
}

export class CacheInvalidatingDeleteTodoService
implements DeleteTodoOperation {
  public constructor(
    private readonly operation:
      DeleteTodoOperation,

    private readonly cacheInvalidator:
      TodoCacheInvalidator,
  ) {}

  public async execute(
    ownerId: string,
    todoId: string,
    requestId: string,
  ): Promise<void> {
    await this.operation.execute(
      ownerId,
      todoId,
      requestId,
    );

    await this.cacheInvalidator
      .invalidateOwner(
        ownerId,
      );
  }
}