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

  readonly repository:
    UpdateTodoRepository;
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

  return {
    updateOwnedTodoMock,
    repository,
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
  "UpdateTodoService",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      },
    );

    it(
      "returns an updated TODO",
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

        const service =
          new UpdateTodoService(
            dependencies.repository,
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
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledWith(
          ownerId,
          todoId,
          {
            state:
              "completed",
          },
        );
      },
    );

    it(
      "allows a shared recipient state update",
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

        const service =
          new UpdateTodoService(
            dependencies.repository,
          );

        const result =
          await service.execute(
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

    it(
      "rejects an empty update",
      async () => {
        const dependencies =
          createDependencies();

        const service =
          new UpdateTodoService(
            dependencies.repository,
          );

        await expect(
          service.execute(
            ownerId,
            todoId,
            {},
          ),
        ).rejects.toMatchObject({
          statusCode:
            400,

          code:
            "EMPTY_UPDATE",

          message:
            "At least one TODO field must be provided",
        });

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns not found for a missing or inaccessible TODO",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "not_found",
          });

        const service =
          new UpdateTodoService(
            dependencies.repository,
          );

        await expect(
          service.execute(
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

          message:
            "TODO was not found",
        });
      },
    );

    it(
      "rejects a shared recipient changing the title",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "forbidden",
          });

        const service =
          new UpdateTodoService(
            dependencies.repository,
          );

        await expect(
          service.execute(
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

          message:
            "A shared TODO recipient may update only the state",
        });
      },
    );

    it(
      "rejects a shared recipient changing multiple fields",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "forbidden",
          });

        const service =
          new UpdateTodoService(
            dependencies.repository,
          );

        await expect(
          service.execute(
            recipientId,
            todoId,
            {
              state:
                "completed",

              description:
                "Unauthorized description change",
            },
          ),
        ).rejects.toMatchObject({
          statusCode:
            403,

          code:
            "SHARED_TODO_UPDATE_FORBIDDEN",
        });
      },
    );

    it(
      "returns conflict for a duplicate active title",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValueOnce({
            status:
              "duplicate_title",
          });

        const service =
          new UpdateTodoService(
            dependencies.repository,
          );

        await expect(
          service.execute(
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

          message:
            "An active TODO with this title already exists",
        });
      },
    );
  },
);