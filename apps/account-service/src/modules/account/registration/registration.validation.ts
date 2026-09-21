import {
  z,
} from "zod";

export const registrationRequestSchema =
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
          12,
          "Password must contain at least 12 characters",
        )
        .max(
          128,
          "Password must not exceed 128 characters",
        ),
    })
    .strict();

export type RegistrationInput =
  z.infer<
    typeof registrationRequestSchema
  >;