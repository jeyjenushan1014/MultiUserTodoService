import {
  describe,
  expect,
  it,
} from "vitest";

import {
  registrationRequestSchema,
} from "../registration.validation.js";

describe(
  "Gateway registration validation",
  () => {
    it(
      "accepts and normalizes a valid request",
      () => {
        const result =
          registrationRequestSchema.parse({
            email:
              "  User@Example.COM  ",
            password:
              "StrongPassword123!",
          });

        expect(result).toEqual({
          email: "user@example.com",
          password:
            "StrongPassword123!",
        });
      },
    );

    it(
      "rejects an invalid email",
      () => {
        const result =
          registrationRequestSchema.safeParse({
            email: "invalid-email",
            password:
              "StrongPassword123!",
          });

        expect(result.success)
          .toBe(false);
      },
    );

    it(
      "rejects a short password",
      () => {
        const result =
          registrationRequestSchema.safeParse({
            email: "user@example.com",
            password: "short",
          });

        expect(result.success)
          .toBe(false);
      },
    );

    it(
      "rejects unexpected properties",
      () => {
        const result =
          registrationRequestSchema.safeParse({
            email: "user@example.com",
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