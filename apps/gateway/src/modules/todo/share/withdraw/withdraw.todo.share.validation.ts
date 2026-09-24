import {
  z,
} from "zod";

export const withdrawTodoShareParamsSchema =
  z
    .object({
      todoId:
        z.uuid(),

      recipientId:
        z.uuid(),
    })
    .strict();