import {
  describe,
  expect,
  it,
  vi,
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

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

describe(
  "CacheInvalidatingDeleteTodoService",
  () => {
    it(
      "invalidates after successful deletion",
      async () => {
        const executeMock =
          vi.fn<
            DeleteTodoOperation[
              "execute"
            ]
          >();

        executeMock.mockResolvedValue();

        const invalidateMock =
          vi.fn<
            TodoCacheInvalidator[
              "invalidateOwner"
            ]
          >();

        invalidateMock.mockResolvedValue();

        const service =
          new CacheInvalidatingDeleteTodoService(
            {
              execute:
                executeMock,
            },
            {
              invalidateOwner:
                invalidateMock,
            },
          );

        await service.execute(
          ownerId,
          todoId,
        );

        expect(
          invalidateMock,
        ).toHaveBeenCalledWith(
          ownerId,
        );
      },
    );

    it(
      "does not invalidate when deletion fails",
      async () => {
        const executeMock =
          vi.fn<
            DeleteTodoOperation[
              "execute"
            ]
          >();

        executeMock.mockRejectedValue(
          new Error(
            "TODO not found",
          ),
        );

        const invalidateMock =
          vi.fn<
            TodoCacheInvalidator[
              "invalidateOwner"
            ]
          >();

        const service =
          new CacheInvalidatingDeleteTodoService(
            {
              execute:
                executeMock,
            },
            {
              invalidateOwner:
                invalidateMock,
            },
          );

        await expect(
          service.execute(
            ownerId,
            todoId,
          ),
        ).rejects.toThrow(
          "TODO not found",
        );

        expect(
          invalidateMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);