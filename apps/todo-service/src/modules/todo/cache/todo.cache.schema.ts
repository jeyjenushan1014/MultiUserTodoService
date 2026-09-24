import {
  z,
} from "zod";

import {
  TODO_STATES,
} from "@todo/contracts";

export const cachedTodoSchema =
  z
    .object({
      id:
        z.uuid(),

      ownerId:
        z.uuid(),

      title:
        z.string(),

      description:
        z.string()
          .nullable(),

      state:
        z.enum(
          TODO_STATES,
        ),

      dueDate:
        z.iso
          .datetime({
            offset: true,
          })
          .nullable(),

      createdAt:
        z.iso.datetime({
          offset: true,
        }),

      updatedAt:
        z.iso.datetime({
          offset: true,
        }),
    })
    .strict();

const cachedAccountReferenceSchema =
  z
    .object({
      id:
        z.uuid(),

      email:
        z.email(),
    })
    .strict();

const cachedTodoDetailsSchema =
  cachedTodoSchema
    .extend({
      accessType: z.enum([
        "owner",
        "shared",
      ]),

      owner:
        cachedAccountReferenceSchema,

      sharedWith:
        z.array(
          cachedAccountReferenceSchema,
        ),
    })
    .strict();

export const cachedListResultSchema =
  z
    .object({
      items: z.array(
        cachedTodoDetailsSchema,
      ),

      totalItems: z
        .number()
        .int()
        .nonnegative(),
    })
    .strict();