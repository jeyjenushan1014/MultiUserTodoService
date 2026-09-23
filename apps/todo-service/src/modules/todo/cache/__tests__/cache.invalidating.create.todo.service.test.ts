import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  CreateTodoOperation,
} from "../cache.invalidating.create.todo.service.js";

import {
  CacheInvalidatingCreateTodoService,
} from "../cache.invalidating.create.todo.service.js";

import type {
  TodoCacheInvalidator,
} from "../todo.cache.invalidator.interface.js";

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const createdTodo = {
  id:
    "9f134ed0-4503-4a23-a189-f065fe9fd838",

  ownerId,

  title:
    "Created TODO",

  description:
    null,

  state:
    "pending" as const,

  dueDate:
    null,

  createdAt:
    "2026-09-23T08:00:00.000Z",

  updatedAt:
    "2026-09-23T08:00:00.000Z",
};

describe(
  "CacheInvalidatingCreateTodoService",
  () => {
    it(
      "invalidates after successful creation",
      async () => {
        const executeMock =
          vi.fn<
            CreateTodoOperation[
              "execute"
            ]
          >();

        executeMock.mockResolvedValue(
          createdTodo,
        );

        const invalidateMock =
          vi.fn<
            TodoCacheInvalidator[
              "invalidateOwner"
            ]
          >();

        invalidateMock.mockResolvedValue();

        const service =
          new CacheInvalidatingCreateTodoService(
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
            {
              title:
                "Created TODO",
            },
          );

        expect(result).toEqual(
          createdTodo,
        );

        expect(
          invalidateMock,
        ).toHaveBeenCalledWith(
          ownerId,
        );
      },
    );

    it(
      "does not invalidate when creation fails",
      async () => {
        const executeMock =
          vi.fn<
            CreateTodoOperation[
              "execute"
            ]
          >();

        executeMock.mockRejectedValue(
          new Error(
            "Duplicate title",
          ),
        );

        const invalidateMock =
          vi.fn<
            TodoCacheInvalidator[
              "invalidateOwner"
            ]
          >();

        const service =
          new CacheInvalidatingCreateTodoService(
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
            {
              title:
                "Duplicate",
            },
          ),
        ).rejects.toThrow(
          "Duplicate title",
        );

        expect(
          invalidateMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);