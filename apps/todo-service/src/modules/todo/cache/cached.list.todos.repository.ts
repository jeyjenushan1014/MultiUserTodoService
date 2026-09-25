import type {
  ListTodosRepository,
} from "../list/list-todos.repository.interface.js";

import type {
  ListTodosParameters,
  ListTodosRepositoryResult,
} from "../list/list-todos.types.js";

import type {
  TodoReadCache,
} from "./todo.read.cache.interface.js";

export class CachedListTodosRepository
implements ListTodosRepository {
  public constructor(
    private readonly repository:
      ListTodosRepository,

    private readonly readCache:
      TodoReadCache,
  ) {}

  public async listTodos(
    parameters:
      ListTodosParameters,
  ): Promise<
    ListTodosRepositoryResult
  > {
    if (
      parameters.access !==
      "owned"
    ) {
      return this.repository
        .listTodos(
          parameters,
        );
    }

    const cached =
      await this.readCache
        .lookupList(
          parameters,
        );

    if (
      cached?.value !==
      undefined
    ) {
      return cached.value;
    }

    const result =
      await this.repository
        .listTodos(
          parameters,
        );

    if (
      cached !==
      undefined
    ) {
      await this.readCache
        .storeList(
          cached.cacheKey,
          result,
        );
    }

    return result;
  }
}