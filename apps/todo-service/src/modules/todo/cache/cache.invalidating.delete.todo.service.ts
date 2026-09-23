import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export interface DeleteTodoOperation {
  execute(
    ownerId: string,
    todoId: string,
  ): Promise<void>;
}

export class CacheInvalidatingDeleteTodoService
implements DeleteTodoOperation {
  public constructor(
    private readonly operation:
      DeleteTodoOperation,

    private readonly invalidator:
      TodoCacheInvalidator,
  ) {}

  public async execute(
    ownerId: string,
    todoId: string,
  ): Promise<void> {
    await this.operation.execute(
      ownerId,
      todoId,
    );

    await this.invalidator
      .invalidateOwner(
        ownerId,
      );
  }
}