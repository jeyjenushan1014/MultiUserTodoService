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
  DeleteTodoOperation,
} from "../cache.invalidating.delete.todo.service.js";

import {
  CacheInvalidatingDeleteTodoService,
} from "../cache.invalidating.delete.todo.service.js";

import type {
  TodoCacheInvalidator,
} from "../todo.cache.invalidator.interface.js";

interface Dependencies {
  readonly executeMock:
    MockedFunction<
      DeleteTodoOperation[
        "execute"
      ]
    >;

  readonly invalidateOwnerMock:
    MockedFunction<
      TodoCacheInvalidator[
        "invalidateOwner"
      ]
    >;

  readonly service:
    CacheInvalidatingDeleteTodoService;
}

function createDependencies():
  Dependencies {
  const executeMock =
    vi.fn<
      DeleteTodoOperation[
        "execute"
      ]
    >();

  const invalidateOwnerMock =
    vi.fn<
      TodoCacheInvalidator[
        "invalidateOwner"
      ]
    >();

  const operation:
    DeleteTodoOperation = {
      execute:
        executeMock,
    };

  const cacheInvalidator:
    TodoCacheInvalidator = {
      invalidateOwner:
        invalidateOwnerMock,
    };

  return {
    executeMock,
    invalidateOwnerMock,

    service:
      new CacheInvalidatingDeleteTodoService(
        operation,
        cacheInvalidator,
      ),
  };
}

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const requestId =
  "224d07f1-8812-429c-a0a6-092d83977ad5";

describe(
  "CacheInvalidatingDeleteTodoService",
  () => {
    it(
      "deletes the TODO and invalidates the owner cache",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .executeMock
          .mockResolvedValueOnce(
            undefined,
          );

        dependencies
          .invalidateOwnerMock
          .mockResolvedValueOnce(
            undefined,
          );

        await dependencies
          .service
          .execute(
            ownerId,
            todoId,
            requestId,
          );

        expect(
          dependencies
            .executeMock,
        ).toHaveBeenCalledWith(
          ownerId,
          todoId,
          requestId,
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).toHaveBeenCalledWith(
          ownerId,
        );
      },
    );

    it(
      "does not invalidate the cache when deletion fails",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .executeMock
          .mockRejectedValueOnce(
            new Error(
              "Deletion failed",
            ),
          );

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
              requestId,
            ),
        ).rejects.toThrow(
          "Deletion failed",
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);