import {
  z,
} from "zod";

import {
  MAXIMUM_TODO_DESCRIPTION_LENGTH,
  MAXIMUM_TODO_TITLE_LENGTH,
  TODO_STATES,
} from "@todo/contracts";

const descriptionSchema =
  z
    .string()
    .max(
      MAXIMUM_TODO_DESCRIPTION_LENGTH,
      `Description must not exceed ${MAXIMUM_TODO_DESCRIPTION_LENGTH} characters`,
    )
    .transform(
      (description) => {
        const trimmed =
          description.trim();

        return trimmed.length === 0
          ? null
          : trimmed;
      },
    );

export const createTodoSchema =
  z
    .object({
      title:
        z
          .string()
          .trim()
          .min(
            1,
            "Title is required",
          )
          .max(
            MAXIMUM_TODO_TITLE_LENGTH,
            `Title must not exceed ${MAXIMUM_TODO_TITLE_LENGTH} characters`,
          ),

      description:
        z
          .union([
            descriptionSchema,
            z.null(),
          ])
          .optional(),

      state:
        z
          .enum(
            TODO_STATES,
          )
          .optional(),

      dueDate:
        z
          .union([
            z.iso.datetime({
              offset: true,
            }),

            z.null(),
          ])
          .optional(),
    })
    .strict();