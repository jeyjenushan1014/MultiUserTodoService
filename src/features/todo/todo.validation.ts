import { z } from "zod";
import { TODO_STATES } from "./todo.types.js";

const emptyObjectSchema = z.object({});

const todoIdSchema = z.string().uuid();

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title cannot exceed 200 characters");

const descriptionSchema = z
  .string()
  .trim()
  .max(
    5000,
    "Description cannot exceed 5000 characters",
  )
  .nullable();

const dueDateSchema = z
  .string()
  .datetime({
    offset: true,
  })
  .nullable();

export const createTodoSchema = z.object({
  body: z.object({
    title: titleSchema,

    description: descriptionSchema.optional(),

    state: z
      .enum(TODO_STATES)
      .optional(),

    dueDate: dueDateSchema.optional(),
  }),

  params: emptyObjectSchema,
  query: emptyObjectSchema,
});

export const listTodosSchema = z.object({
  body: emptyObjectSchema,

  params: emptyObjectSchema,

  query: z.object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),

    state: z
      .enum(TODO_STATES)
      .optional(),

    sortBy: z
      .enum(["createdAt", "dueDate"])
      .default("createdAt"),

    sortOrder: z
      .enum(["asc", "desc"])
      .default("desc"),
  }),
});

export const updateTodoSchema = z.object({
  body: z
    .object({
      title: titleSchema.optional(),

      description: descriptionSchema.optional(),

      state: z
        .enum(TODO_STATES)
        .optional(),

      dueDate: dueDateSchema.optional(),
    })
    .refine(
      (body) => Object.keys(body).length > 0,
      {
        message:
          "At least one field must be provided",
      },
    ),

  params: z.object({
    id: todoIdSchema,
  }),

  query: emptyObjectSchema,
});

export const deleteTodoSchema = z.object({
  body: emptyObjectSchema,

  params: z.object({
    id: todoIdSchema,
  }),

  query: emptyObjectSchema,
});