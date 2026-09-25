import type {
  GetTodoResponse,
} from "@todo/contracts";

import type {
  FindAccessibleTodoParameters,
  GetTodoRepository,
} from "../get/get.todo.repository.interface.js";

import type {
  TodoReadCache,
} from "./todo.read.cache.interface.js";

export class CachedGetTodoRepository
implements GetTodoRepository {
  private readonly databaseRepository:
    GetTodoRepository;

  public constructor(
    databaseRepository:
      GetTodoRepository,

    readCache:
      TodoReadCache,
  ) {
    this.databaseRepository =
      databaseRepository;
    this.readCache =
      readCache;
  }

  private readonly readCache:
    TodoReadCache;

  public async findAccessibleById(
    parameters:
      FindAccessibleTodoParameters,
  ): Promise<
    GetTodoResponse | undefined
  > {
    const cached =
      await this.readCache
        .lookupItem(
          parameters.callerId,
          parameters.todoId,
        );

    if (
      cached?.value !==
      undefined
    ) {
      return cached.value;
    }

    const result =
      await this.databaseRepository
        .findAccessibleById(
          parameters,
        );

    if (
      cached !==
      undefined &&
      result !==
      undefined &&
      result.ownerId ===
      parameters.callerId
    ) {
      await this.readCache
        .storeItem(
          cached.cacheKey,
          result,
        );
    }

    return result;
  }
}