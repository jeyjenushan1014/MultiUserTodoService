import {
  z,
} from "zod";

export const loginRequestSchema =
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

      password: z
        .string()
        .min(
          1,
          "Password is required",
        )
        .max(
          128,
          "Password must not exceed 128 characters",
        ),
    })
    .strict();

export type LoginInput =
  z.infer<
    typeof loginRequestSchema
  >;