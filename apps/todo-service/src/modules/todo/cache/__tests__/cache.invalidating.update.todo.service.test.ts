import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  UpdateTodoOperation,
} from "../cache.invalidating.update.todo.service.js";

import {
  CacheInvalidatingUpdateTodoService,
} from "../cache.invalidating.update.todo.service.js";

import type {
  TodoCacheInvalidator,
} from "../todo.cache.invalidator.interface.js";

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const updatedTodo = {
  id:
    todoId,

  ownerId,

  title:
    "Updated TODO",

  description:
    null,

  state:
    "completed" as const,

  dueDate:
    null,

  createdAt:
    "2026-09-23T08:00:00.000Z",

  updatedAt:
    "2026-09-23T09:00:00.000Z",
};

describe(
  "CacheInvalidatingUpdateTodoService",
  () => {
    it(
      "invalidates after successful update",
      async () => {
        const executeMock =
          vi.fn<
            UpdateTodoOperation[
              "execute"
            ]
          >();

        executeMock.mockResolvedValue(
          updatedTodo,
        );

        const invalidateMock =
          vi.fn<
            TodoCacheInvalidator[
              "invalidateOwner"
            ]
          >();

        invalidateMock.mockResolvedValue();

        const service =
          new CacheInvalidatingUpdateTodoService(
            {
              execute:
                executeMock,
            },
            {
              invalidateOwner:
                invalidateMock,
            },
          );

        const result =
          await service.execute(
            ownerId,
            todoId,
            {
              state:
                "completed",
            },
          );

        expect(result).toEqual(
          updatedTodo,
        );

        expect(
          invalidateMock,
        ).toHaveBeenCalledWith(
          ownerId,
        );
      },
    );

    it(
      "does not invalidate when update fails",
      async () => {
        const executeMock =
          vi.fn<
            UpdateTodoOperation[
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
          new CacheInvalidatingUpdateTodoService(
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
            {
              state:
                "completed",
            },
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