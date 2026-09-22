import {
  z,
} from "zod";


const passwordSchema =
  z
    .string()
    .min(
      12,
      "Password must contain at least 12 characters",
    )
    .max(
      128,
      "Password must not exceed 128 characters",
    )
    .regex(
      /[a-z]/,
      "Password must contain a lowercase letter",
    )
    .regex(
      /[A-Z]/,
      "Password must contain an uppercase letter",
    )
    .regex(
      /\d/,
      "Password must contain a number",
    )
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain a special character",
    );

export const passwordResetRequestSchema =
  z
    .object({
       email: z
        .string()
        .trim()
        .max(
          254,
          "Email must not exceed 254 characters",
        )
        .pipe(
          z.email({
            error:
              "A valid email address is required",
          }),
        )
        .transform((value) =>
          value.toLowerCase(),
        ),
    })
    .strict();

export const confirmPasswordResetSchema =
  z
    .object({
      token:
        z
          .string()
          .min(
            32,
            "A valid password reset token is required",
          )
          .max(
            512,
            "The password reset token is too long",
          ),

      newPassword:
        passwordSchema,
    })
    .strict();