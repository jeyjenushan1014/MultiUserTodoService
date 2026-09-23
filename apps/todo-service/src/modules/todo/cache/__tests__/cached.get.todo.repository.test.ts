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
  GetTodoRepository,
} from "../../get/get.todo.repository.interface.js";

import {
  CachedGetTodoRepository,
} from "../cached.get.todo.repository.js";

import type {
  TodoReadCache,
} from "../todo.read.cache.interface.js";

interface Dependencies {
  readonly findOwnedTodoByIdMock:
    MockedFunction<
      GetTodoRepository[
        "findOwnedTodoById"
      ]
    >;

  readonly lookupItemMock:
    MockedFunction<
      TodoReadCache[
        "lookupItem"
      ]
    >;

  readonly storeItemMock:
    MockedFunction<
      TodoReadCache[
        "storeItem"
      ]
    >;

  readonly repository:
    CachedGetTodoRepository;
}

function createDependencies():
  Dependencies {
  const findOwnedTodoByIdMock =
    vi.fn<
      GetTodoRepository[
        "findOwnedTodoById"
      ]
    >();

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

  const databaseRepository:
    GetTodoRepository = {
      findOwnedTodoById:
        findOwnedTodoByIdMock,
    };

  const readCache:
    TodoReadCache = {
      lookupItem:
        lookupItemMock,

      storeItem:
        storeItemMock,

      lookupList:
        vi.fn<
          TodoReadCache[
            "lookupList"
          ]
        >(),

      storeList:
        vi.fn<
          TodoReadCache[
            "storeList"
          ]
        >(),
    };

  return {
    findOwnedTodoByIdMock,
    lookupItemMock,
    storeItemMock,

    repository:
      new CachedGetTodoRepository(
        databaseRepository,
        readCache,
      ),
  };
}

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const todo:
  TodoResponse = {
    id:
      todoId,

    ownerId,

    title:
      "Cached TODO",

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

describe(
  "CachedGetTodoRepository",
  () => {
    it(
      "returns a cache hit without calling PostgreSQL",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupItemMock
          .mockResolvedValue({
            cacheKey:
              "item-key",
            value:
              todo,
          });

        const result =
          await dependencies
            .repository
            .findOwnedTodoById(
              ownerId,
              todoId,
            );

        expect(result).toEqual(
          todo,
        );

        expect(
          dependencies
            .findOwnedTodoByIdMock,
        ).not.toHaveBeenCalled();

        expect(
          dependencies
            .storeItemMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "loads PostgreSQL and stores a cache miss",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupItemMock
          .mockResolvedValue({
            cacheKey:
              "item-key",
          });

        dependencies
          .findOwnedTodoByIdMock
          .mockResolvedValue(
            todo,
          );

        const result =
          await dependencies
            .repository
            .findOwnedTodoById(
              ownerId,
              todoId,
            );

        expect(result).toEqual(
          todo,
        );

        expect(
          dependencies
            .storeItemMock,
        ).toHaveBeenCalledWith(
          "item-key",
          todo,
        );
      },
    );

    it(
      "uses PostgreSQL when Redis is unavailable",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupItemMock
          .mockResolvedValue(
            undefined,
          );

        dependencies
          .findOwnedTodoByIdMock
          .mockResolvedValue(
            todo,
          );

        const result =
          await dependencies
            .repository
            .findOwnedTodoById(
              ownerId,
              todoId,
            );

        expect(result).toEqual(
          todo,
        );

        expect(
          dependencies
            .storeItemMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not cache a missing TODO",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupItemMock
          .mockResolvedValue({
            cacheKey:
              "item-key",
          });

        dependencies
          .findOwnedTodoByIdMock
          .mockResolvedValue(
            undefined,
          );

        const result =
          await dependencies
            .repository
            .findOwnedTodoById(
              ownerId,
              todoId,
            );

        expect(result).toBeUndefined();

        expect(
          dependencies
            .storeItemMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);