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
  UpdateTodoRepository,
} from "../update.todo.repository.interface.js";

import {
  UpdateTodoService,
} from "../update.todo.service.js";

interface Dependencies {
  readonly updateOwnedTodoMock:
    MockedFunction<
      UpdateTodoRepository[
        "updateOwnedTodo"
      ]
    >;

  readonly service:
    UpdateTodoService;
}

function createDependencies():
  Dependencies {
  const updateOwnedTodoMock =
    vi.fn<
      UpdateTodoRepository[
        "updateOwnedTodo"
      ]
    >();

  const repository:
    UpdateTodoRepository = {
      updateOwnedTodo:
        updateOwnedTodoMock,
    };

  return {
    updateOwnedTodoMock,

    service:
      new UpdateTodoService(
        repository,
      ),
  };
}

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const updatedTodo:
  TodoResponse = {
    id:
      todoId,

    ownerId,

    title:
      "Updated TODO",

    description:
      null,

    state:
      "completed",

    dueDate:
      null,

    createdAt:
      "2026-09-22T08:00:00.000Z",

    updatedAt:
      "2026-09-23T08:00:00.000Z",
  };

describe(
  "UpdateTodoService",
  () => {
    it(
      "returns the updated TODO",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValue({
            status:
              "updated",

            todo:
              updatedTodo,
          });

        const result =
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

        expect(result).toEqual(
          updatedTodo,
        );

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledWith(
          ownerId,
          todoId,
          {
            title:
              "Updated TODO",
          },
        );
      },
    );

    it(
      "rejects an empty direct service update",
      async () => {
        const dependencies =
          createDependencies();

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
              {},
            ),
        ).rejects.toMatchObject({
          statusCode: 400,
          code:
            "EMPTY_UPDATE",
        });

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      "missing TODO",
      "another owner's TODO",
      "soft-deleted TODO",
    ])(
      "returns the same response for %s",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValue({
            status:
              "not_found",
          });

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
              {
                state:
                  "completed",
              },
            ),
        ).rejects.toMatchObject({
          statusCode: 404,
          code:
            "TODO_NOT_FOUND",
          message:
            "TODO was not found",
        });
      },
    );

    it(
      "maps a duplicate title to conflict",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValue({
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
                  "Existing title",
              },
            ),
        ).rejects.toMatchObject({
          statusCode: 409,
          code:
            "TODO_TITLE_ALREADY_EXISTS",
        });
      },
    );

    it(
      "propagates unexpected repository errors",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
              {
                state:
                  "completed",
              },
            ),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);