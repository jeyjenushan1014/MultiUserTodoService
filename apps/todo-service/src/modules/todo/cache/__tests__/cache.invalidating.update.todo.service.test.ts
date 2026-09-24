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
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import {
  CacheInvalidatingUpdateTodoService,
} from "../cache.invalidating.update.todo.service.js";

import type {
  UpdateTodoOperation,
} from "../cache.invalidating.update.todo.service.js";

import type {
  TodoCacheInvalidator,
} from "../todo.cache.invalidator.interface.js";

interface TestDependencies {
  readonly executeMock:
    MockedFunction<
      UpdateTodoOperation[
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
    CacheInvalidatingUpdateTodoService;
}

function createDependencies():
TestDependencies {
  const executeMock =
    vi.fn<
      UpdateTodoOperation[
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
    UpdateTodoOperation = {
      execute: (
        callerId,
        todoId,
        changes,
      ) =>
        executeMock(
          callerId,
          todoId,
          changes,
        ),
    };

  const invalidator:
    TodoCacheInvalidator = {
      invalidateOwner: (
        ownerId,
      ) =>
        invalidateOwnerMock(
          ownerId,
        ),
    };

  return {
    executeMock,
    invalidateOwnerMock,

    service:
      new CacheInvalidatingUpdateTodoService(
        operation,
        invalidator,
      ),
  };
}

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const recipientId =
  "1bc664af-ceff-4ea2-82d1-a44fbb5cb773";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const updatedTodo:
  UpdateTodoResponse = {
    id:
      todoId,

    ownerId,

    title:
      "Updated TODO",

    description:
      "Updated description",

    state:
      "completed",

    dueDate:
      "2026-10-01T10:00:00.000Z",

    createdAt:
      "2026-09-24T08:00:00.000Z",

    updatedAt:
      "2026-09-24T09:00:00.000Z",
  };

describe(
  "CacheInvalidatingUpdateTodoService",
  () => {
    it(
      "returns the updated TODO",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .executeMock
          .mockResolvedValue(
            updatedTodo,
          );

        dependencies
          .invalidateOwnerMock
          .mockResolvedValue();

        const changes:
          UpdateTodoRequest = {
            title:
              "Updated TODO",
          };

        const result =
          await dependencies
            .service
            .execute(
              ownerId,
              todoId,
              changes,
            );

        expect(result).toEqual(
          updatedTodo,
        );
      },
    );

    it(
      "forwards all arguments to the update operation",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .executeMock
          .mockResolvedValue(
            updatedTodo,
          );

        dependencies
          .invalidateOwnerMock
          .mockResolvedValue();

        const changes:
          UpdateTodoRequest = {
            title:
              "Updated TODO",

            description:
              "Updated description",
          };

        await dependencies
          .service
          .execute(
            ownerId,
            todoId,
            changes,
          );

        expect(
          dependencies.executeMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          dependencies.executeMock,
        ).toHaveBeenCalledWith(
          ownerId,
          todoId,
          changes,
        );
      },
    );

    it(
      "invalidates the owner after a successful owner update",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .executeMock
          .mockResolvedValue(
            updatedTodo,
          );

        dependencies
          .invalidateOwnerMock
          .mockResolvedValue();

        await dependencies
          .service
          .execute(
            ownerId,
            todoId,
            {
              title:
                "Updated TODO",
            },
          );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).toHaveBeenCalledTimes(
          1,
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
      "invalidates the actual owner after a recipient state update",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .executeMock
          .mockResolvedValue(
            updatedTodo,
          );

        dependencies
          .invalidateOwnerMock
          .mockResolvedValue();

        await dependencies
          .service
          .execute(
            recipientId,
            todoId,
            {
              state:
                "completed",
            },
          );

        /*
         * The caller is the recipient, but the
         * invalidated cache belongs to the actual
         * TODO owner.
         */
        expect(
          dependencies
            .invalidateOwnerMock,
        ).toHaveBeenCalledWith(
          ownerId,
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalledWith(
          recipientId,
        );
      },
    );

    it(
      "does not invalidate when the update operation fails",
      async () => {
        const dependencies =
          createDependencies();

        const updateError =
          new Error(
            "Update failed",
          );

        dependencies
          .executeMock
          .mockRejectedValue(
            updateError,
          );

        const operation =
          dependencies.service
            .execute(
              ownerId,
              todoId,
              {
                title:
                  "Updated TODO",
              },
            );

        await expect(
          operation,
        ).rejects.toBe(
          updateError,
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "propagates a cache invalidation failure",
      async () => {
        const dependencies =
          createDependencies();

        const cacheError =
          new Error(
            "Cache invalidation failed",
          );

        dependencies
          .executeMock
          .mockResolvedValue(
            updatedTodo,
          );

        dependencies
          .invalidateOwnerMock
          .mockRejectedValue(
            cacheError,
          );

        const operation =
          dependencies.service
            .execute(
              ownerId,
              todoId,
              {
                state:
                  "completed",
              },
            );

        await expect(
          operation,
        ).rejects.toBe(
          cacheError,
        );
      },
    );
  },
);