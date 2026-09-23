import {
  describe,
  expect,
  it,
} from "vitest";

import {
  listTodosQuerySchema,
} from "../../../../../gateway/src/modules/todo/list/list-todos.validation.js";

describe(
  "listTodosQuerySchema",
  () => {
    it(
      "applies default pagination",
      () => {
        const result =
          listTodosQuerySchema.parse(
            {},
          );

        expect(result).toEqual({
          page: 1,
          pageSize: 20,
        });
      },
    );

    it(
      "accepts valid string query parameters",
      () => {
        const result =
          listTodosQuerySchema.parse({
            page: "2",
            pageSize: "25",
          });

        expect(result).toEqual({
          page: 2,
          pageSize: 25,
        });
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
      "rejects a negative page",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            page: "-1",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects a non-integer page",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            page: "1.5",
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
      "rejects unknown query parameters",
      () => {
        const result =
          listTodosQuerySchema.safeParse({
            page: "1",
            ownerId:
              "another-user",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );
  },
);