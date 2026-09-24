import {
  describe,
  expect,
  it,
} from "vitest";

import {
  changeEmailSchema,
} from "../email-change.validation.js";

describe(
  "Email-change validation",
  () => {
    it(
      "accepts and normalizes valid input",
      () => {
        expect(
          changeEmailSchema.parse({
            email:
              "  New@Example.COM  ",
            currentPassword:
              "StrongPassword123!",
          }),
        ).toEqual({
          email:
            "new@example.com",
          currentPassword:
            "StrongPassword123!",
        });
      },
    );

    it(
      "rejects an invalid email",
      () => {
        expect(
          changeEmailSchema.safeParse({
            email: "invalid",
            currentPassword:
              "StrongPassword123!",
          }).success,
        ).toBe(false);
      },
    );

    it(
      "rejects an empty current password",
      () => {
        expect(
          changeEmailSchema.safeParse({
            email:
              "new@example.com",
            currentPassword: "",
          }).success,
        ).toBe(false);
      },
    );

    it(
      "rejects unexpected properties",
      () => {
        expect(
          changeEmailSchema.safeParse({
            email:
              "new@example.com",
            currentPassword:
              "StrongPassword123!",
            userId: "injected",
          }).success,
        ).toBe(false);
      },
    );
  },
);