
import {
  z,
} from "zod";

import {
  DEFAULT_TODO_PAGE,
  DEFAULT_TODO_PAGE_SIZE,
 MAXIMUM_TODO_PAGE_SIZE,
 TODO_STATES,
 SORT_ORDERS,
 DEFAULT_TODO_SORT_FIELD,
 DEFAULT_SORT_ORDER,
 TODO_SORT_FIELDS
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


