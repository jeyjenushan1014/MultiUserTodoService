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
  TodoResponse,
} from "@todo/contracts";

import type {
  UpdateTodoRepository,
} from "../../update/update.todo.repository.interface.js";

import {
  UpdateTodoService,
} from "../../update/update.todo.service.js";

import {
  CacheInvalidatingUpdateTodoService,
} from "../cache.invalidating.update.todo.service.js";

import type {
  TodoCacheInvalidator,
} from "../todo.cache.invalidator.interface.js";

interface Dependencies {
  readonly updateOwnedTodoMock:
    MockedFunction<
      UpdateTodoRepository[
        "updateOwnedTodo"
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
  Dependencies {
  const updateOwnedTodoMock =
    vi.fn<
      UpdateTodoRepository[
        "updateOwnedTodo"
      ]
    >();

  const invalidateOwnerMock =
    vi.fn<
      TodoCacheInvalidator[
        "invalidateOwner"
      ]
    >();

  const repository:
    UpdateTodoRepository = {
      updateOwnedTodo:
        (
          ownerId,
          todoId,
          changes,
        ) =>
          updateOwnedTodoMock(
            ownerId,
            todoId,
            changes,
          ),
    };

  const cacheInvalidator:
    TodoCacheInvalidator = {
      invalidateOwner:
        (ownerId) =>
          invalidateOwnerMock(
            ownerId,
          ),
    };

  const baseService =
    new UpdateTodoService(
      repository,
    );

  return {
    updateOwnedTodoMock,
    invalidateOwnerMock,

    service:
      new CacheInvalidatingUpdateTodoService(
        baseService,
        cacheInvalidator,
      ),
  };
}

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const recipientId =
  "2dced07e-8468-4a4b-9d23-cd96c75fb962";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const updatedTodo:
  TodoResponse = {
    id:
      todoId,

    ownerId,

    title:
      "Shared task",

    description:
      null,

    state:
      "completed",

    dueDate:
      null,

    createdAt:
      "2026-09-24T08:00:00.000Z",

    updatedAt:
      "2026-09-24T09:00:00.000Z",
  };

describe(
  "CacheInvalidatingUpdateTodoService",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

    it(
      "invalidates the owner cache after an owner update",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "updated",

            todo:
              updatedTodo,
          });

        dependencies
          .invalidateOwnerMock
          .mockResolvedValueOnce();

        const result =
          await dependencies
            .service
            .execute(
              ownerId,
              todoId,
              {
                title:
                  "Shared task",
              },
            );

        expect(result).toEqual(
          updatedTodo,
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).toHaveBeenCalledWith(
          ownerId,
        );

        expect(
          dependencies
            .invalidateOwnerMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "invalidates the actual owner after a recipient state update",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "updated",

            todo:
              updatedTodo,
          });

        dependencies
          .invalidateOwnerMock
          .mockResolvedValueOnce();

        const result =
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

        expect(result).toEqual(
          updatedTodo,
        );

        /*
         * The recipient made the request, but the
         * TODO owner's cache must be invalidated.
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
      "does not invalidate cache when access is denied",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "not_found",
          });

        await expect(
          dependencies
            .service
            .execute(
              recipientId,
              todoId,
              {
                state:
                  "completed",
              },
            ),
        ).rejects.toMatchObject({
          statusCode:
            404,

          code:
            "TODO_NOT_FOUND",
        });

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not invalidate cache for a forbidden shared update",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "forbidden",
          });

        await expect(
          dependencies
            .service
            .execute(
              recipientId,
              todoId,
              {
                title:
                  "Unauthorized rename",
              },
            ),
        ).rejects.toMatchObject({
          statusCode:
            403,

          code:
            "SHARED_TODO_UPDATE_FORBIDDEN",
        });

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not invalidate cache for a duplicate title",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "duplicate_title",
          });

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
              {
                title:
                  "Existing active title",
              },
            ),
        ).rejects.toMatchObject({
          statusCode:
            409,

          code:
            "TODO_TITLE_ALREADY_EXISTS",
        });

        expect(
          dependencies
            .invalidateOwnerMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "passes the original update arguments to the base service",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "updated",

            todo:
              updatedTodo,
          });

        dependencies
          .invalidateOwnerMock
          .mockResolvedValueOnce();

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

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledWith(
          recipientId,
          todoId,
          {
            state:
              "completed",
          },
        );
      },
    );
  },
);