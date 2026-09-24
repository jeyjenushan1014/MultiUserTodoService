import {
  describe,
  expect,
  it,
} from "vitest";

import {
  loginRequestSchema,
} from "../login.validation.js";

describe(
  "Gateway login validation",
  () => {
    it(
      "accepts and normalizes valid credentials",
      () => {
        const result =
          loginRequestSchema.parse({
            email:
              "  User@Example.COM  ",
            password:
              "StrongPassword123!",
          });

        expect(result).toEqual({
          email:
            "user@example.com",
          password:
            "StrongPassword123!",
        });
      },
    );

    it(
      "rejects an invalid email",
      () => {
        const result =
          loginRequestSchema.safeParse({
            email:
              "invalid-email",
            password:
              "StrongPassword123!",
          });

        expect(result.success)
          .toBe(false);
      },
    );

    it(
      "rejects an empty password",
      () => {
        const result =
          loginRequestSchema.safeParse({
            email:
              "user@example.com",
            password: "",
          });

        expect(result.success)
          .toBe(false);
      },
    );

    it(
      "rejects unexpected properties",
      () => {
        const result =
          loginRequestSchema.safeParse({
            email:
              "user@example.com",
            password:
              "StrongPassword123!",
            role: "admin",
          });

        expect(result.success)
          .toBe(false);
      },
    );
  },
);