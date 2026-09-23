import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getTodoParamsSchema,
} from "../get.todo.validation.js";

describe(
  "getTodoParamsSchema",
  () => {
    it(
      "accepts a valid UUID",
      () => {
        const result =
          getTodoParamsSchema.parse({
            todoId:
              "9f134ed0-4503-4a23-a189-f065fe9fd838",
          });

        expect(result).toEqual({
          todoId:
            "9f134ed0-4503-4a23-a189-f065fe9fd838",
        });
      },
    );

    it(
      "rejects a non-UUID TODO ID",
      () => {
        const result =
          getTodoParamsSchema.safeParse({
            todoId:
              "not-a-uuid",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an empty TODO ID",
      () => {
        const result =
          getTodoParamsSchema.safeParse({
            todoId: "",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an SQL injection value",
      () => {
        const result =
          getTodoParamsSchema.safeParse({
            todoId:
              "' OR '1'='1",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects unknown parameters",
      () => {
        const result =
          getTodoParamsSchema.safeParse({
            todoId:
              "9f134ed0-4503-4a23-a189-f065fe9fd838",

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