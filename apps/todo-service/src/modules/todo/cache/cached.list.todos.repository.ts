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
    const lookup =
      await this.readCache
        .lookupList(
          parameters,
        );

    if (
      lookup?.value !==
      undefined
    ) {
      return lookup.value;
    }

    const result =
      await this.repository
        .listTodos(
          parameters,
        );

    if (lookup !== undefined) {
      await this.readCache
        .storeList(
          lookup.cacheKey,
          result,
        );
    }

    return result;
  }
}