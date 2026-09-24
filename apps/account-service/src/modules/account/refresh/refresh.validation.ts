import {
  z,
} from "zod";

export const refreshSessionSchema =
  z
    .object({
      refreshToken: z
        .string()
        .min(
          32,
          "Refresh token is invalid",
        )
        .max(
          256,
          "Refresh token is invalid",
        ),
    })
    .strict();

export type RefreshSessionInput =
  z.infer<
    typeof refreshSessionSchema
  >;