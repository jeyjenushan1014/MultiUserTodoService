import {
  z,
} from "zod";

export const loginRequestSchema =
  z
    .object({
      email: z
        .string()
        .trim()
        .max(254)
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
        .max(128),
    })
    .strict();