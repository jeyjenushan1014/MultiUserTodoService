import {
  z,
} from "zod";

import {
  DEFAULT_TODO_PAGE,
  DEFAULT_TODO_PAGE_SIZE,
 MAXIMUM_TODO_PAGE_SIZE,
} from "@todo/contracts";

export const listTodosQuerySchema =
  z
    .object({
      page: z.coerce
        .number()
        .int()
        .min(1)
        .default(
          DEFAULT_TODO_PAGE,
        ),

      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(
          MAXIMUM_TODO_PAGE_SIZE,
        )
        .default(
          DEFAULT_TODO_PAGE_SIZE,
        ),
    })
    .strict();

export type ValidatedListTodosQuery =
  z.infer<
    typeof listTodosQuerySchema
  >;