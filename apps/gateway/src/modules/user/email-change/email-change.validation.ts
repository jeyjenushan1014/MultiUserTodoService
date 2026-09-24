import {
  z,
} from "zod";

export const changeEmailSchema =
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

      currentPassword: z
        .string()
        .min(
          1,
          "Current password is required",
        )
        .max(128),
    })
    .strict();