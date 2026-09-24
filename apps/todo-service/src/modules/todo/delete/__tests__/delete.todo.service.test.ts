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
  DeleteTodoRepository,
} from "../delete.todo.repository.interface.js";

import {
  DeleteTodoService,
} from "../delete.todo.service.js";

interface Dependencies {
  readonly softDeleteOwnedTodoMock:
    MockedFunction<
      DeleteTodoRepository[
        "softDeleteOwnedTodo"
      ]
    >;

  readonly service:
    DeleteTodoService;
}

function createDependencies():
  Dependencies {
  const softDeleteOwnedTodoMock =
    vi.fn<
      DeleteTodoRepository[
        "softDeleteOwnedTodo"
      ]
    >();

  const repository:
    DeleteTodoRepository = {
      softDeleteOwnedTodo:
        softDeleteOwnedTodoMock,
    };

  return {
    softDeleteOwnedTodoMock,

    service:
      new DeleteTodoService(
        repository,
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
  "DeleteTodoService",
  () => {
    it(
      "deletes an active owned TODO",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .softDeleteOwnedTodoMock
          .mockResolvedValue(
            true,
          );

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
              requestId,
            ),
        ).resolves.toBeUndefined();

        expect(
          dependencies
            .softDeleteOwnedTodoMock,
        ).toHaveBeenCalledWith(
          ownerId,
          todoId,
          requestId,
        );
      },
    );

    it.each([
      "missing TODO",
      "another owner's TODO",
      "already-deleted TODO",
    ])(
      "returns the same not-found response for %s",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .softDeleteOwnedTodoMock
          .mockResolvedValue(
            false,
          );

        await expect(
          dependencies
            .service
            .execute(
              ownerId,
              todoId,
              requestId,
            ),
        ).rejects.toMatchObject({
          statusCode:
            404,

          code:
            "TODO_NOT_FOUND",

          message:
            "TODO was not found",
        });
      },
    );

    it(
      "propagates unexpected repository failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .softDeleteOwnedTodoMock
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
              requestId,
            ),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);