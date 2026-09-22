import {
  describe,
  expect,
  it,
} from "vitest";

import {
  passwordResetRequestSchema,
} from "../password-reset.validation.js";

describe(
  "passwordResetRequestSchema",
  () => {
    it(
      "accepts and normalizes a valid email",
      () => {
        const result =
          passwordResetRequestSchema.parse({
            email:
              "  User@Example.COM  ",
          });

        expect(result).toEqual({
          email:
            "user@example.com",
        });
      },
    );

    it(
      "rejects an invalid email",
      () => {
        expect(() =>
          passwordResetRequestSchema.parse({
            email: "invalid-email",
          }),
        ).toThrow();
      },
    );

    it(
      "rejects a missing email",
      () => {
        expect(() =>
          passwordResetRequestSchema.parse({}),
        ).toThrow();
      },
    );

    it(
      "rejects unknown fields",
      () => {
        expect(() =>
          passwordResetRequestSchema.parse({
            email:
              "user@example.com",
            admin: true,
          }),
        ).toThrow();
      },
    );
  },
);