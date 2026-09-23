import {
  z,
} from "zod";

import {
  MAXIMUM_TODO_DESCRIPTION_LENGTH,
  MAXIMUM_TODO_TITLE_LENGTH,
  TODO_STATES,
} from "@todo/contracts";

const nullableDescriptionSchema =
  z.union([
    z
      .string()
      .trim()
      .max(
        MAXIMUM_TODO_DESCRIPTION_LENGTH,
      )
      .transform(
        (
          value,
        ): string | null =>
          value.length === 0
            ? null
            : value,
      ),

    z.null(),
  ]);

const nullableDueDateSchema =
  z.union([
    z.iso.datetime({
      offset: true,
    }),

    z.null(),
  ]);

export const updateTodoBodySchema =
  z
    .object({
      title: z
        .string()
        .trim()
        .min(1)
        .max(
          MAXIMUM_TODO_TITLE_LENGTH,
        )
        .optional(),

      description:
        nullableDescriptionSchema
          .optional(),

      state: z
        .enum(
          TODO_STATES,
        )
        .optional(),

      dueDate:
        nullableDueDateSchema
          .optional(),
    })
    .strict()
    .refine(
      (value) =>
        Object.keys(value)
          .length > 0,
      {
        message:
          "At least one TODO field must be provided",
      },
    );