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

    /*
     * Preserve the constructor used by the
     * existing composition code.
     *
     * Single-item authorization cannot use Redis
     * because a share can be withdrawn at any time.
     */
    void readCache;
  }

  public async findAccessibleById(
    parameters:
      FindAccessibleTodoParameters,
  ): Promise<
    GetTodoResponse | undefined
  > {
    return this.databaseRepository
      .findAccessibleById(
        parameters,
      );
  }
}