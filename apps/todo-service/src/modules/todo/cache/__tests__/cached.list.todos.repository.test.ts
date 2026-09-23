import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  MockedFunction,
} from "vitest";

import type {
  TodoResponse,
} from "@todo/contracts";

import type {
  ListTodosRepository,
} from "../../list/list-todos.repository.interface.js";

import type {
  ListTodosParameters,
  ListTodosRepositoryResult,
} from "../../list/list-todos.types.js";

import {
  CachedListTodosRepository,
} from "../cached.list.todos.repository.js";

import type {
  TodoReadCache,
} from "../todo.read.cache.interface.js";

interface Dependencies {
  readonly listTodosMock:
    MockedFunction<
      ListTodosRepository[
        "listTodos"
      ]
    >;

  readonly lookupListMock:
    MockedFunction<
      TodoReadCache[
        "lookupList"
      ]
    >;

  readonly storeListMock:
    MockedFunction<
      TodoReadCache[
        "storeList"
      ]
    >;

  readonly repository:
    CachedListTodosRepository;
}

function createDependencies():
  Dependencies {
  const listTodosMock =
    vi.fn<
      ListTodosRepository[
        "listTodos"
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

  const databaseRepository:
    ListTodosRepository = {
      listTodos:
        listTodosMock,
    };

  const readCache:
    TodoReadCache = {
      lookupItem:
        vi.fn<
          TodoReadCache[
            "lookupItem"
          ]
        >(),

      storeItem:
        vi.fn<
          TodoReadCache[
            "storeItem"
          ]
        >(),

      lookupList:
        lookupListMock,

      storeList:
        storeListMock,
    };

  return {
    listTodosMock,
    lookupListMock,
    storeListMock,

    repository:
      new CachedListTodosRepository(
        databaseRepository,
        readCache,
      ),
  };
}

const parameters:
  ListTodosParameters = {
    ownerId:
      "70668eae-dac5-4b75-9bd3-02c963eb5b99",

    page: 1,
    pageSize: 20,
    state: "pending",
    sortBy: "createdAt",
    sortOrder: "desc",
  };

const todo:
  TodoResponse = {
    id:
      "9f134ed0-4503-4a23-a189-f065fe9fd838",

    ownerId:
      parameters.ownerId,

    title:
      "Cached list TODO",

    description:
      null,

    state:
      "pending",

    dueDate:
      null,

    createdAt:
      "2026-09-23T08:00:00.000Z",

    updatedAt:
      "2026-09-23T08:00:00.000Z",
  };

const listResult:
  ListTodosRepositoryResult = {
    items: [
      todo,
    ],

    totalItems: 1,
  };

describe(
  "CachedListTodosRepository",
  () => {
    it(
      "returns a cache hit without calling PostgreSQL",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupListMock
          .mockResolvedValue({
            cacheKey:
              "list-key",

            value:
              listResult,
          });

        const result =
          await dependencies
            .repository
            .listTodos(
              parameters,
            );

        expect(result).toEqual(
          listResult,
        );

        expect(
          dependencies
            .listTodosMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "loads PostgreSQL and stores a cache miss",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupListMock
          .mockResolvedValue({
            cacheKey:
              "list-key",
          });

        dependencies
          .listTodosMock
          .mockResolvedValue(
            listResult,
          );

        const result =
          await dependencies
            .repository
            .listTodos(
              parameters,
            );

        expect(result).toEqual(
          listResult,
        );

        expect(
          dependencies
            .storeListMock,
        ).toHaveBeenCalledWith(
          "list-key",
          listResult,
        );
      },
    );

    it(
      "uses PostgreSQL when Redis is unavailable",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupListMock
          .mockResolvedValue(
            undefined,
          );

        dependencies
          .listTodosMock
          .mockResolvedValue(
            listResult,
          );

        const result =
          await dependencies
            .repository
            .listTodos(
              parameters,
            );

        expect(result).toEqual(
          listResult,
        );

        expect(
          dependencies
            .storeListMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "caches an empty list",
      async () => {
        const dependencies =
          createDependencies();

        const emptyResult:
          ListTodosRepositoryResult = {
            items: [],
            totalItems: 0,
          };

        dependencies
          .lookupListMock
          .mockResolvedValue({
            cacheKey:
              "list-key",
          });

        dependencies
          .listTodosMock
          .mockResolvedValue(
            emptyResult,
          );

        await dependencies
          .repository
          .listTodos(
            parameters,
          );

        expect(
          dependencies
            .storeListMock,
        ).toHaveBeenCalledWith(
          "list-key",
          emptyResult,
        );
      },
    );
  },
);