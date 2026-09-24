import {
  describe,
  expect,
  it,
} from "vitest";

import {
  listTodosQuerySchema,
} from "../list-todos.validation.js";

describe(
  "listTodosQuerySchema",
  () => {
    it(
      "defaults access to all",
      () => {
        const result =
          listTodosQuerySchema
            .parse({});

        expect(
          result.access,
        ).toBe("all");
      },
    );

    it.each([
      "owned",
      "shared",
      "all",
    ] as const)(
      "accepts the %s access filter",
      (
        access,
      ) => {
        const result =
          listTodosQuerySchema
            .parse({
              access,
            });

        expect(
          result.access,
        ).toBe(access);
      },
    );

    it(
      "rejects an invalid access filter",
      () => {
        const result =
          listTodosQuerySchema
            .safeParse({
              access:
                "invalid",
            });

        expect(
          result.success,
        ).toBe(false);
      },
    );
  },
);