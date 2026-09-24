import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createTodoShareBodySchema,
} from "../share.todo.validation.js";

describe(
  "createTodoShareBodySchema",
  () => {
    it(
      "accepts a valid recipient ID",
      () => {
        expect(
          createTodoShareBodySchema
            .parse({
              recipientId:
                "44444444-4444-4444-8444-444444444444",
            }),
        ).toEqual({
          recipientId:
            "44444444-4444-4444-8444-444444444444",
        });
      },
    );

    it(
      "rejects an invalid recipient ID",
      () => {
        expect(
          createTodoShareBodySchema
            .safeParse({
              recipientId:
                "invalid",
            })
            .success,
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects unexpected fields",
      () => {
        expect(
          createTodoShareBodySchema
            .safeParse({
              recipientId:
                "44444444-4444-4444-8444-444444444444",

              permission:
                "full-control",
            })
            .success,
        ).toBe(
          false,
        );
      },
    );
  },
);