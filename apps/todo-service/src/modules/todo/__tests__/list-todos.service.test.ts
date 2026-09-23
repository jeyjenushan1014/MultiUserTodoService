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
  ListTodosRepository,
} from "../list/list-todos.repository.interface.js";

import {
  ListTodosService,
} from "../list/list-todo.service.js";

interface Dependencies {
  readonly listTodosMock:
    MockedFunction<
      ListTodosRepository[
        "listTodos"
      ]
    >;

  readonly service:
    ListTodosService;
}

function createDependencies():
  Dependencies {
  const listTodosMock =
    vi.fn<
      ListTodosRepository[
        "listTodos"
      ]
    >();

  const repository:
    ListTodosRepository = {
      listTodos:
        listTodosMock,
    };

  return {
    listTodosMock,

    service:
      new ListTodosService(
        repository,
      ),
  };
}

const todo:
  TodoResponse = {
    id:
      "9f134ed0-4503-4a23-a189-f065fe9fd838",

    ownerId:
      "70668eae-dac5-4b75-9bd3-02c963eb5b99",

    title:
      "Finish TODO filtering",

    description:
      null,

    state:
      "pending",

    dueDate:
      "2026-09-25T10:00:00.000Z",

    createdAt:
      "2026-09-22T08:00:00.000Z",

    updatedAt:
      "2026-09-22T08:00:00.000Z",
  };

describe(
  "ListTodosService",
  () => {
    it(
      "forwards state and sorting to the repository",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .listTodosMock
          .mockResolvedValue({
            items: [
              todo,
            ],
            totalItems: 1,
          });

        const result =
          await dependencies
            .service
            .execute(
              todo.ownerId,
              {
                page: 1,
                pageSize: 20,
                state: "pending",
                sortBy: "dueDate",
                sortOrder: "asc",
              },
            );

        expect(
          dependencies
            .listTodosMock,
        ).toHaveBeenCalledWith({
          ownerId:
            todo.ownerId,
          page: 1,
          pageSize: 20,
          state: "pending",
          sortBy: "dueDate",
          sortOrder: "asc",
        });

        expect(result).toEqual({
          items: [
            todo,
          ],

          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 1,
            totalPages: 1,
          },
        });
      },
    );

    it(
      "lists every state when state is undefined",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .listTodosMock
          .mockResolvedValue({
            items: [
              todo,
            ],
            totalItems: 1,
          });

        await dependencies
          .service
          .execute(
            todo.ownerId,
            {
              page: 1,
              pageSize: 20,
              sortBy:
                "createdAt",
              sortOrder:
                "desc",
            },
          );

        expect(
          dependencies
            .listTodosMock,
        ).toHaveBeenCalledWith({
          ownerId:
            todo.ownerId,
          page: 1,
          pageSize: 20,
          state: undefined,
          sortBy:
            "createdAt",
          sortOrder:
            "desc",
        });
      },
    );

    it(
      "calculates total pages after filtering",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .listTodosMock
          .mockResolvedValue({
            items: [],
            totalItems: 21,
          });

        const result =
          await dependencies
            .service
            .execute(
              todo.ownerId,
              {
                page: 2,
                pageSize: 10,
                state:
                  "completed",
                sortBy:
                  "createdAt",
                sortOrder:
                  "desc",
              },
            );

        expect(
          result.pagination,
        ).toEqual({
          page: 2,
          pageSize: 10,
          totalItems: 21,
          totalPages: 3,
        });
      },
    );

    it(
      "returns zero pages for an empty filtered result",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .listTodosMock
          .mockResolvedValue({
            items: [],
            totalItems: 0,
          });

        const result =
          await dependencies
            .service
            .execute(
              todo.ownerId,
              {
                page: 1,
                pageSize: 20,
                state:
                  "cancelled",
                sortBy:
                  "dueDate",
                sortOrder:
                  "asc",
              },
            );

        expect(result).toEqual({
          items: [],

          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 0,
            totalPages: 0,
          },
        });
      },
    );

    it(
      "propagates repository failures",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .listTodosMock
          .mockRejectedValue(
            new Error(
              "Database unavailable",
            ),
          );

        await expect(
          dependencies
            .service
            .execute(
              todo.ownerId,
              {
                page: 1,
                pageSize: 20,
                sortBy:
                  "createdAt",
                sortOrder:
                  "desc",
              },
            ),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);