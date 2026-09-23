import {
  z,
} from "zod";

export const resolveAccountBodySchema =
  z.object({
    email:
      z.email()
        .transform(
          (
            value,
          ) =>
            value
              .trim()
              .toLowerCase(),
        ),
  })
    .strict();