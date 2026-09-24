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

import type {
  UpdateTodoRepository,
} from "../update.todo.repository.interface.js";

import {
  UpdateTodoService,
} from "../update.todo.service.js";

interface TestDependencies {
  readonly updateOwnedTodoMock:
    MockedFunction<
      UpdateTodoRepository[
        "updateOwnedTodo"
      ]
    >;

  readonly updateAccessibleTodoStateMock:
    MockedFunction<
      UpdateTodoRepository[
        "updateAccessibleTodoState"
      ]
    >;

  readonly service:
    UpdateTodoService;
}

function createDependencies():
TestDependencies {
  const updateOwnedTodoMock =
    vi.fn<
      UpdateTodoRepository[
        "updateOwnedTodo"
      ]
    >();

  const updateAccessibleTodoStateMock =
    vi.fn<
      UpdateTodoRepository[
        "updateAccessibleTodoState"
      ]
    >();

  const repository:
    UpdateTodoRepository = {
      updateOwnedTodo: (
        ownerId,
        todoId,
        changes,
        requestId,
      ) =>
        updateOwnedTodoMock(
          ownerId,
          todoId,
          changes,
          requestId,
        ),

      updateAccessibleTodoState: (
        callerId,
        todoId,
        state,
        requestId,
      ) =>
        updateAccessibleTodoStateMock(
          callerId,
          todoId,
          state,
          requestId,
        ),
    };

  return {
    updateOwnedTodoMock,
    updateAccessibleTodoStateMock,

    service:
      new UpdateTodoService(
        repository,
      ),
  };
}

const callerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const requestId =
  "224d07f1-8812-429c-a0a6-092d83977ad5";

const updatedTodo:
  UpdateTodoResponse = {
    id:
      todoId,

    ownerId:
      callerId,

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
  "UpdateTodoService",
  () => {
    it(
      "rejects an empty update",
      async () => {
        const dependencies =
          createDependencies();

        const operation =
          dependencies.service
            .execute(
              callerId,
              todoId,
              {},
              requestId,
            );

        await expect(
          operation,
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

        expect(
          dependencies
            .updateAccessibleTodoStateMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses accessible state update for a state-only request",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateAccessibleTodoStateMock
          .mockResolvedValue({
            status:
              "updated",

            todo:
              updatedTodo,
          });

        const changes:
          UpdateTodoRequest = {
            state:
              "completed",
          };

        const result =
          await dependencies
            .service
            .execute(
              callerId,
              todoId,
              changes,
              requestId,
            );

        expect(result).toEqual(
          updatedTodo,
        );

        expect(
          dependencies
            .updateAccessibleTodoStateMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          dependencies
            .updateAccessibleTodoStateMock,
        ).toHaveBeenCalledWith(
          callerId,
          todoId,
          "completed",
          requestId,
        );

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses owner-only update when changing the title",
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

        const changes:
          UpdateTodoRequest = {
            title:
              "Updated TODO",
          };

        const result =
          await dependencies
            .service
            .execute(
              callerId,
              todoId,
              changes,
              requestId,
            );

        expect(result).toEqual(
          updatedTodo,
        );

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledWith(
          callerId,
          todoId,
          changes,
          requestId,
        );

        expect(
          dependencies
            .updateAccessibleTodoStateMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses owner-only update when state and another field are changed",
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

        const changes:
          UpdateTodoRequest = {
            title:
              "Updated TODO",

            state:
              "completed",
          };

        const result =
          await dependencies
            .service
            .execute(
              callerId,
              todoId,
              changes,
              requestId,
            );

        expect(result).toEqual(
          updatedTodo,
        );

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledWith(
          callerId,
          todoId,
          changes,
          requestId,
        );

        expect(
          dependencies
            .updateAccessibleTodoStateMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns TODO not found when the repository returns not_found",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateAccessibleTodoStateMock
          .mockResolvedValue({
            status:
              "not_found",
          });

        const operation =
          dependencies.service
            .execute(
              callerId,
              todoId,
              {
                state:
                  "completed",
              },
              requestId,
            );

        await expect(
          operation,
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
      "returns TODO not found when access is forbidden",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValue({
            status:
              "forbidden",
          });

        const operation =
          dependencies.service
            .execute(
              callerId,
              todoId,
              {
                title:
                  "Forbidden update",
              },
              requestId,
            );

        await expect(
          operation,
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
      "rejects a duplicate active title",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .updateOwnedTodoMock
          .mockResolvedValue({
            status:
              "duplicate_title",
          });

        const operation =
          dependencies.service
            .execute(
              callerId,
              todoId,
              {
                title:
                  "Existing title",
              },
              requestId,
            );

        await expect(
          operation,
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

    it(
      "uses owner-only update when changing the description",
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

        const changes:
          UpdateTodoRequest = {
            description:
              "Updated description",
          };

        await expect(
          dependencies.service
            .execute(
              callerId,
              todoId,
              changes,
              requestId,
            ),
        ).resolves.toEqual(
          updatedTodo,
        );

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledWith(
          callerId,
          todoId,
          changes,
          requestId,
        );
      },
    );

    it(
      "uses owner-only update when changing the due date",
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

        const changes:
          UpdateTodoRequest = {
            dueDate:
              "2026-10-01T10:00:00.000Z",
          };

        await expect(
          dependencies.service
            .execute(
              callerId,
              todoId,
              changes,
              requestId,
            ),
        ).resolves.toEqual(
          updatedTodo,
        );

        expect(
          dependencies
            .updateOwnedTodoMock,
        ).toHaveBeenCalledWith(
          callerId,
          todoId,
          changes,
          requestId,
        );
      },
    );
  },
);