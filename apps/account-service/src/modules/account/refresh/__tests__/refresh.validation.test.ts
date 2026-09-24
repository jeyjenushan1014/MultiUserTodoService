import {
  describe,
  expect,
  it,
} from "vitest";

import {
  refreshSessionSchema,
} from "../refresh.validation.js";

describe(
  "Account refresh validation",
  () => {
    it(
      "accepts a valid refresh token",
      () => {
        const token =
          "a".repeat(43);

        expect(
          refreshSessionSchema.parse({
            refreshToken: token,
          }),
        ).toEqual({
          refreshToken: token,
        });
      },
    );

    it(
      "rejects a short token",
      () => {
        const result =
          refreshSessionSchema.safeParse({
            refreshToken: "short",
          });

        expect(result.success)
          .toBe(false);
      },
    );

    it(
      "rejects an empty token",
      () => {
        const result =
          refreshSessionSchema.safeParse({
            refreshToken: "",
          });

        expect(result.success)
          .toBe(false);
      },
    );

    it(
      "rejects unexpected properties",
      () => {
        const result =
          refreshSessionSchema.safeParse({
            refreshToken:
              "a".repeat(43),
            userId: "injected",
          });

        expect(result.success)
          .toBe(false);
      },
    );
  },
);