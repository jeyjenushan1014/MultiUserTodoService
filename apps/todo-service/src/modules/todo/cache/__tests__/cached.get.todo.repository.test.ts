import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  MockedFunction,
} from "vitest";

import type {
  GetTodoResponse,
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
  readonly findAccessibleByIdMock:
    MockedFunction<
      GetTodoRepository[
        "findAccessibleById"
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
  const findAccessibleByIdMock =
    vi.fn<
      GetTodoRepository[
        "findAccessibleById"
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
    GetTodoRepository = {
      findAccessibleById:
        (parameters) =>
          findAccessibleByIdMock(
            parameters,
          ),
    };

  const readCache:
    TodoReadCache = {
      lookupItem:
        (
          ownerId,
          todoId,
        ) =>
          lookupItemMock(
            ownerId,
            todoId,
          ),

      storeItem:
        (
          cacheKey,
          todo,
        ) =>
          storeItemMock(
            cacheKey,
            todo,
          ),

      lookupList:
        (parameters) =>
          lookupListMock(
            parameters,
          ),

      storeList:
        (
          cacheKey,
          result,
        ) =>
          storeListMock(
            cacheKey,
            result,
          ),
    };

  return {
    findAccessibleByIdMock,
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

const recipientId =
  "2dced07e-8468-4a4b-9d23-cd96c75fb962";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const todo:
  GetTodoResponse = {
    id:
      todoId,

    ownerId,

    title:
      "Shared TODO",

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

    accessType:
      "shared",

    owner: {
      id:
        ownerId,

      email:
        "owner@example.com",
    },

    sharedWith: [
      {
        id:
          recipientId,

        email:
          "recipient@example.com",
      },
    ],
  };

describe(
  "CachedGetTodoRepository",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

    it(
      "reads an accessible TODO from PostgreSQL",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findAccessibleByIdMock
          .mockResolvedValueOnce(
            todo,
          );

        const result =
          await dependencies
            .repository
            .findAccessibleById({
              callerId:
                recipientId,

              todoId,
            });

        expect(result).toEqual(
          todo,
        );

        expect(
          dependencies
            .findAccessibleByIdMock,
        ).toHaveBeenCalledWith({
          callerId:
            recipientId,

          todoId,
        });
      },
    );

    it(
      "returns an authorized item from Redis when available",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .lookupItemMock
          .mockResolvedValueOnce(
            {
              cacheKey:
                "todo:owner:1:1:item:todo",

              value:
                todo,
            },
          );

        await dependencies
          .repository
          .findAccessibleById({
            callerId:
                ownerId,

            todoId,
          });

        expect(
          dependencies
            .lookupItemMock,
        ).toHaveBeenCalledWith(
          ownerId,
          todoId,
        );

        expect(
          dependencies
            .findAccessibleByIdMock,
        ).not.toHaveBeenCalled();

        expect(
          dependencies
            .storeItemMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns undefined when PostgreSQL denies access",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findAccessibleByIdMock
          .mockResolvedValueOnce(
            undefined,
          );

        const result =
          await dependencies
            .repository
            .findAccessibleById({
              callerId:
                recipientId,

              todoId,
            });

        expect(
          result,
        ).toBeUndefined();

        expect(
          dependencies
            .lookupItemMock,
        ).toHaveBeenCalledWith(
          recipientId,
          todoId,
        );

        expect(
          dependencies
            .storeItemMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "checks PostgreSQL again after share access changes",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findAccessibleByIdMock
          .mockResolvedValueOnce(
            todo,
          )
          .mockResolvedValueOnce(
            undefined,
          );

        const parameters = {
          callerId:
            recipientId,

          todoId,
        };

        const firstResult =
          await dependencies
            .repository
            .findAccessibleById(
              parameters,
            );

        const secondResult =
          await dependencies
            .repository
            .findAccessibleById(
              parameters,
            );

        expect(firstResult).toEqual(
          todo,
        );

        expect(
          secondResult,
        ).toBeUndefined();

        expect(
          dependencies
            .findAccessibleByIdMock,
        ).toHaveBeenCalledTimes(2);
      },
    );
  },
);