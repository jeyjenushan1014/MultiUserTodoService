import {
  z,
} from "zod";

export const createTodoShareBodySchema =
  z.object({
    recipientId:
      z.uuid(),
  })
    .strict();