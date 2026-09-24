import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ListTodosRepository,
} from "../../list/list-todos.repository.interface.js";

import {
  CachedListTodosRepository,
} from "../cached.list.todos.repository.js";

import type {
  TodoReadCache,
} from "../todo.read.cache.interface.js";

function createReadCache():
TodoReadCache {
  return {
    lookupItem:
      vi.fn(),

    storeItem:
      vi.fn(),

    lookupList:
      vi.fn(),

    storeList:
      vi.fn(),
  };
}

describe(
  "CachedListTodosRepository",
  () => {
    it(
      "uses PostgreSQL directly so withdrawn shares cannot remain cached",
      async () => {
        const listTodosMock =
          vi.fn<
            ListTodosRepository[
              "listTodos"
            ]
          >();

        listTodosMock
          .mockResolvedValue({
            items:
              [],

            totalItems:
              0,
          });

        const databaseRepository:
          ListTodosRepository = {
            listTodos:
              listTodosMock,
          };

        const readCache =
          createReadCache();

        const repository =
          new CachedListTodosRepository(
            databaseRepository,
            readCache,
          );

        const parameters = {
          ownerId:
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",

          page:
            1,

          pageSize:
            20,

          access:
            "all" as const,

          sortBy:
            "createdAt" as const,

          sortOrder:
            "desc" as const,
        };

        const result =
          await repository.listTodos(
            parameters,
          );

        expect(result).toEqual({
          items:
            [],

          totalItems:
            0,
        });

        expect(
          listTodosMock,
        ).toHaveBeenCalledWith(
          parameters,
        );

        expect(
          readCache.lookupList,
        ).not.toHaveBeenCalled();

        expect(
          readCache.storeList,
        ).not.toHaveBeenCalled();
      },
    );
  },
);