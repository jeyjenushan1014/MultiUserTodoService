import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ListTodosRepository,
} from "../list/list-todos.repository.interface.js";

import {
  ListTodosService,
} from "../list/list-todo.service.js";

function createRepository(): {
  repository: ListTodosRepository;
  listTodosMock: ReturnType<
    typeof vi.fn<
      ListTodosRepository["listTodos"]
    >
  >;
} {
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
    repository,
    listTodosMock,
  };
}

describe(
  "ListTodosService",
  () => {
    it(
      "passes the authenticated caller and access filter to the repository",
      async () => {
        const {
          repository,
          listTodosMock,
        } =
          createRepository();

        listTodosMock
          .mockResolvedValue({
            items:
              [],

            totalItems:
              0,
          });

        const service =
          new ListTodosService(
            repository,
          );

        const result =
          await service.execute(
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
            {
              page:
                1,

              pageSize:
                20,

              access:
                "shared",

              sortBy:
                "createdAt",

              sortOrder:
                "desc",
            },
          );

        expect(result).toEqual({
          items:
            [],

          pagination: {
            page:
              1,

            pageSize:
              20,

            totalItems:
              0,

            totalPages:
              0,
          },
        });

        expect(
          listTodosMock,
        ).toHaveBeenCalledWith({
          ownerId:
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",

          page:
            1,

          pageSize:
            20,

          access:
            "shared",

          sortBy:
            "createdAt",

          sortOrder:
            "desc",
        });
      },
    );

    it(
      "calculates pagination metadata",
      async () => {
        const {
          repository,
          listTodosMock,
        } =
          createRepository();

        listTodosMock
          .mockResolvedValue({
            items:
              [],

            totalItems:
              21,
          });

        const service =
          new ListTodosService(
            repository,
          );

        const result =
          await service.execute(
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
            {
              page:
                2,

              pageSize:
                10,

              state:
                "pending",

              access:
                "all",

              sortBy:
                "dueDate",

              sortOrder:
                "asc",
            },
          );

        expect(
          result.pagination,
        ).toEqual({
          page:
            2,

          pageSize:
            10,

          totalItems:
            21,

          totalPages:
            3,
        });

        expect(
          listTodosMock,
        ).toHaveBeenCalledWith({
          ownerId:
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",

          page:
            2,

          pageSize:
            10,

          state:
            "pending",

          access:
            "all",

          sortBy:
            "dueDate",

          sortOrder:
            "asc",
        });
      },
    );
  },
);