import {
  z,
} from "zod";

import {
  DEFAULT_SORT_ORDER,
  DEFAULT_TODO_PAGE,
  DEFAULT_TODO_PAGE_SIZE,
  DEFAULT_TODO_SORT_FIELD,
  MAXIMUM_TODO_PAGE_SIZE,
  SORT_ORDERS,
  TODO_LIST_ACCESS_TYPES,
  TODO_SORT_FIELDS,
  TODO_STATES,
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

      state: z
        .enum(
          TODO_STATES,
        )
        .optional(),

      access: z
        .enum(
          TODO_LIST_ACCESS_TYPES,
        )
        .default("all"),

      sortBy: z
        .enum(
          TODO_SORT_FIELDS,
        )
        .default(
          DEFAULT_TODO_SORT_FIELD,
        ),

      sortOrder: z
        .enum(
          SORT_ORDERS,
        )
        .default(
          DEFAULT_SORT_ORDER,
        ),
    })
    .strict();

export type ValidatedListTodosQuery =
  z.infer<
    typeof listTodosQuerySchema
  >;