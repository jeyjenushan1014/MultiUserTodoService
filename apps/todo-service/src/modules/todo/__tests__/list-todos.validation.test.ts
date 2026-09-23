import {
  describe,
  expect,
  it,
} from "vitest";

import {
  listTodosQuerySchema,
} from "../list/list-todos.validation.js";

describe(
  "listTodosQuerySchema",
  () => {
    it(
      "applies every default value",
      () => {
        const result =
          listTodosQuerySchema.parse(
            {},
          );

        expect(result).toEqual({
          page: 1,
          pageSize: 20,
          sortBy: "createdAt",
          sortOrder: "desc",
        });
      },
    );

    it(
      "accepts complete valid query parameters",
      () => {
        const result =
          listTodosQuerySchema.parse({
            page: "2",
            pageSize: "25",
            state:
              "in_progress",
            sortBy:
              "dueDate",
            sortOrder:
              "asc",
          });

        expect(result).toEqual({
          page: 2,
          pageSize: 25,
          state:
            "in_progress",
          sortBy:
            "dueDate",
          sortOrder:
            "asc",
        });
      },
    );

    it.each([
      "pending",
      "in_progress",
      "completed",
      "cancelled",
    ])(
      "accepts the %s state",
      (state) => {
        const result =
          listTodosQuerySchema.safeParse({
            state,
          });

        expect(
          result.success,
        ).toBe(true);
      },
    );

    it(
      "rejects an unsupported state",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            state: "deleted",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it.each([
      "createdAt",
      "dueDate",
    ])(
      "accepts the %s sort field",
      (sortBy) => {
        const result =
          listTodosQuerySchema.safeParse({
            sortBy,
          });

        expect(
          result.success,
        ).toBe(true);
      },
    );

    it(
      "rejects an unsupported sort field",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            sortBy: "title",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it.each([
      "asc",
      "desc",
    ])(
      "accepts the %s sort order",
      (sortOrder) => {
        const result =
          listTodosQuerySchema.safeParse({
            sortOrder,
          });

        expect(
          result.success,
        ).toBe(true);
      },
    );

    it(
      "rejects an unsupported sort order",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            sortOrder:
              "descending",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects page zero",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            page: "0",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects page size above 100",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            pageSize: "101",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an unknown owner ID",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            ownerId:
              "another-user",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an SQL injection sorting value",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            sortBy:
              "createdAt; DROP TABLE todos;",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an SQL injection state value",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            state:
              "pending' OR '1'='1",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );
  },
);