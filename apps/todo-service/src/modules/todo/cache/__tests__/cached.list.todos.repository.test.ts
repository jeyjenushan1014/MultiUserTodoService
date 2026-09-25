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

function createReadCache(): {
  readCache: TodoReadCache;
  lookupListMock: ReturnType<
    typeof vi.fn<
      TodoReadCache["lookupList"]
    >
  >;
  storeListMock: ReturnType<
    typeof vi.fn<
      TodoReadCache["storeList"]
    >
  >;
} {
  const lookupItemMock =
    vi.fn<
      TodoReadCache[
        "lookupItem"
      ]
    >();

  const storeItemMock =
    vi.fn<
      TodoReadCache[
        "storeItem"
      ]
    >();

  const lookupListMock =
    vi.fn<
      TodoReadCache[
        "lookupList"
      ]
    >();

  const storeListMock =
    vi.fn<
      TodoReadCache[
        "storeList"
      ]
    >();

  const readCache:
  TodoReadCache = {
    lookupItem:
      lookupItemMock,

    storeItem:
      storeItemMock,

    lookupList:
      lookupListMock,

    storeList:
      storeListMock,
  };

  return {
    readCache,
    lookupListMock,
    storeListMock,
  };
}

describe(
  "CachedListTodosRepository",
  () => {
    it(
      "returns an owner list from Redis when available",
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

        const {
          readCache,
          lookupListMock,
          storeListMock,
        } =
          createReadCache();

        lookupListMock
          .mockResolvedValueOnce({
            cacheKey:
              "todo:owner:1:list:query",

            value: {
              items: [],

              totalItems: 0,
            },
          });

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
            "owned" as const,

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
          lookupListMock,
        ).toHaveBeenCalledWith(
          parameters,
        );

        expect(
          listTodosMock,
        ).not.toHaveBeenCalled();

        expect(
          storeListMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "loads and stores an owner list on a cache miss",
      async () => {
        const listTodosMock =
          vi.fn<
            ListTodosRepository[
              "listTodos"
            ]
          >()
            .mockResolvedValue({
              items: [],

              totalItems: 0,
            });

        const databaseRepository:
        ListTodosRepository = {
          listTodos:
            listTodosMock,
        };

        const {
          readCache,
          lookupListMock,
          storeListMock,
        } =
          createReadCache();

        lookupListMock
          .mockResolvedValueOnce({
            cacheKey:
              "todo:owner:1:list:query",
          });

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
            "owned" as const,

          sortBy:
            "createdAt" as const,

          sortOrder:
            "desc" as const,
        };

        const result =
          await repository
            .listTodos(
              parameters,
            );

        expect(result).toEqual({
          items: [],

          totalItems: 0,
        });

        expect(
          storeListMock,
        ).toHaveBeenCalledWith(
          "todo:owner:1:list:query",
          result,
        );
      },
    );

    it(
      "bypasses Redis for shared-access lists",
      async () => {
        const listTodosMock =
          vi.fn<
            ListTodosRepository[
              "listTodos"
            ]
          >()
            .mockResolvedValue({
              items: [],

              totalItems: 0,
            });

        const databaseRepository:
        ListTodosRepository = {
          listTodos:
            listTodosMock,
        };

        const {
          readCache,
          lookupListMock,
          storeListMock,
        } =
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
            "shared" as const,

          sortBy:
            "createdAt" as const,

          sortOrder:
            "desc" as const,
        };

        await repository
          .listTodos(
            parameters,
          );

        expect(
          lookupListMock,
        ).not.toHaveBeenCalled();

        expect(
          storeListMock,
        ).not.toHaveBeenCalled();

        expect(
          listTodosMock,
        ).toHaveBeenCalledWith(
          parameters,
        );

        expect(
          lookupListMock,
        ).not.toHaveBeenCalled();

        expect(
          storeListMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);