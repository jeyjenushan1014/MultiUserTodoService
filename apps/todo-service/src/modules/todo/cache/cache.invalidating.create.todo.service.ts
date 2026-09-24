import type {
  CreateTodoRequest,
  CreateTodoResponse,
} from "@todo/contracts";

import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export interface CreateTodoOperation {
  execute(
    ownerId: string,
    request:
      CreateTodoRequest,
  ): Promise<
    CreateTodoResponse
  >;
}

export class CacheInvalidatingCreateTodoService
implements CreateTodoOperation {
  public constructor(
    private readonly operation:
      CreateTodoOperation,

    private readonly invalidator:
      TodoCacheInvalidator,
  ) {}

  public async execute(
    ownerId: string,
    request:
      CreateTodoRequest,
  ): Promise<
    CreateTodoResponse
  > {
    const result =
      await this.operation.execute(
        ownerId,
        request,
      );

    /*
     * This line runs only after the create operation
     * succeeds. Validation, duplicate-title or owner
     * projection failures do not invalidate cache.
     */
    await this.invalidator
      .invalidateOwner(
        ownerId,
      );

    return result;
  }
}