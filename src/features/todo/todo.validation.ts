import { z } from "zod";
import { TODO_STATES } from "./todo.types.js";

const emptyObjectSchema = z.object({});

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

