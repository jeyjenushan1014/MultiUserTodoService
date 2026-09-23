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
} from "../get.todo.repository.interface.js";

import {
  GetTodoService,
} from "../get.todo.service.js";

interface Dependencies {
  readonly findOwnedTodoByIdMock:
    MockedFunction<
      GetTodoRepository[
        "findOwnedTodoById"
      ]
    >;

  readonly service:
    GetTodoService;
}

function createDependencies():
  Dependencies {
  const findOwnedTodoByIdMock =
    vi.fn<
      GetTodoRepository[
        "findOwnedTodoById"
      ]
    >();

  const repository:
    GetTodoRepository = {
      findOwnedTodoById:
        findOwnedTodoByIdMock,
    };

  return {
    findOwnedTodoByIdMock,

    service:
      new GetTodoService(
        repository,
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
      "Test owner-scoped retrieval",

    description:
      null,

    state:
      "pending",

    dueDate:
      null,

    createdAt:
      "2026-09-22T08:00:00.000Z",

    updatedAt:
      "2026-09-22T08:00:00.000Z",
  };

describe(
  "GetTodoService",
  () => {
    it(
      "returns an owned TODO",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findOwnedTodoByIdMock
          .mockResolvedValue(
            todo,
          );

        const result =
          await dependencies
            .service
            .execute(
              ownerId,
              todoId,
            );

        expect(result).toEqual(
          todo,
        );

        expect(
          dependencies
            .findOwnedTodoByIdMock,
        ).toHaveBeenCalledWith(
          ownerId,
          todoId,
        );
      },
    );

    it.each([
      "TODO does not exist",
      "TODO belongs to another owner",
      "TODO is soft-deleted",
    ])(
      "returns the same not-found error when %s",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findOwnedTodoByIdMock
          .mockResolvedValue(
            undefined,
          );

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
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
      "propagates repository failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .findOwnedTodoByIdMock
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
            ),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);