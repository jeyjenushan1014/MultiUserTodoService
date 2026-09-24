import {
  z,
} from "zod";

export const getTodoParamsSchema =
  z
    .object({
      todoId:
        z.uuid(),
    })
    .strict();