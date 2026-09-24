import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveAccountBodySchema,
} from "../account-lookup.validation.js";

describe(
  "resolveAccountBodySchema",
  () => {
    it(
      "accepts and normalizes a valid email",
      () => {
        const result =
          resolveAccountBodySchema
            .parse({
              email:
                "USER@EXAMPLE.COM",
            });

        expect(
          result,
        ).toEqual({
          email:
            "user@example.com",
        });
      },
    );

    it(
      "rejects an invalid email",
      () => {
        const result =
          resolveAccountBodySchema
            .safeParse({
              email:
                "invalid-email",
            });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects a missing email",
      () => {
        const result =
          resolveAccountBodySchema
            .safeParse({});

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects unexpected fields",
      () => {
        const result =
          resolveAccountBodySchema
            .safeParse({
              email:
                "user@example.com",

              password:
                "should-not-be-here",
            });

        expect(
          result.success,
        ).toBe(
          false,
        );
      },
    );
  },
);