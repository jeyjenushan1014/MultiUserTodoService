import {
  describe,
  expect,
  it,
} from "vitest";

import {
  confirmPasswordResetSchema,
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
      "rejects unknown properties",
      () => {
        expect(() =>
          passwordResetRequestSchema.parse({
            email:
              "user@example.com",
            role: "admin",
          }),
        ).toThrow();
      },
    );
  },
);

describe(
  "confirmPasswordResetSchema",
  () => {
    it(
      "accepts a valid token and password",
      () => {
        const result =
          confirmPasswordResetSchema.parse({
            token:
              "a-secure-password-reset-token-containing-more-than-32-characters",
            newPassword:
              "StrongPassword123!",
          });

        expect(result).toEqual({
          token:
            "a-secure-password-reset-token-containing-more-than-32-characters",
          newPassword:
            "StrongPassword123!",
        });
      },
    );

    it(
      "rejects a short token",
      () => {
        expect(() =>
          confirmPasswordResetSchema.parse({
            token: "short-token",
            newPassword:
              "StrongPassword123!",
          }),
        ).toThrow();
      },
    );

    it(
      "rejects a weak password",
      () => {
        expect(() =>
          confirmPasswordResetSchema.parse({
            token:
              "a-secure-password-reset-token-containing-more-than-32-characters",
            newPassword: "password",
          }),
        ).toThrow();
      },
    );

    it(
      "rejects unknown properties",
      () => {
        expect(() =>
          confirmPasswordResetSchema.parse({
            token:
              "a-secure-password-reset-token-containing-more-than-32-characters",
            newPassword:
              "StrongPassword123!",
            role: "admin",
          }),
        ).toThrow();
      },
    );
  },
);