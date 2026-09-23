import type {
  ListTodosQuery,
  ListTodosResponse,
} from "@todo/contracts";

import type {
  ListTodosRepository,
} from "./list-todos.repository.interface.js";

export class ListTodosService {
  public constructor(
    private readonly repository:
      ListTodosRepository,
  ) {}

  public async execute(
    ownerId: string,
    query: ListTodosQuery,
  ): Promise<ListTodosResponse> {
    const result =
      await this.repository.listTodos({
        ownerId,

        page:
          query.page,

        pageSize:
          query.pageSize,

        ...(query.state === undefined
          ? {}
          : {
              state:
                query.state,
            }),

        sortBy:
          query.sortBy,

        sortOrder:
          query.sortOrder,
      });

    const totalPages =
      result.totalItems === 0
        ? 0
        : Math.ceil(
            result.totalItems /
              query.pageSize,
          );

    return {
      items:
        result.items,

      pagination: {
        page:
          query.page,

        pageSize:
          query.pageSize,

        totalItems:
          result.totalItems,

        totalPages,
      },
    };
  }
}