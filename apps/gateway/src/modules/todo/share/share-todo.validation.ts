import {
  z,
} from "zod";

export const shareTodoBodySchema =
  z.object({
    recipientEmail:
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