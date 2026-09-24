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
  ) {
    /*
     * Preserve the existing constructor contract.
     *
     * Shared access can be withdrawn independently
     * of the caller's cache version. Therefore list
     * reads currently use PostgreSQL as the source
     * of truth.
     */
    void this.readCache;
  }

  public async listTodos(
    parameters:
      ListTodosParameters,
  ): Promise<
    ListTodosRepositoryResult
  > {
    return this.repository
      .listTodos(
        parameters,
      );
  }
}