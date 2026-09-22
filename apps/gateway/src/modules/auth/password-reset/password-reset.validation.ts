import {
  z,
} from "zod";

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