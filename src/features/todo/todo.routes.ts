import {Router} from "express";
import { asyncHandler } from "../../shared/async-handler";
import * as todoController from "./todo.controller.js"
import { validate } from "../../shared/validate";
import { createTodoSchema,deleteTodoSchema,listTodosSchema,updateTodoSchema } from "./todo.validation";
import { authenticate } from "../../middleware/authenticate.middleware.js";



export const todoRouter=Router();


todoRouter.post(
    "/",
    authenticate,
    validate(createTodoSchema),
    asyncHandler(todoController.createTodo)
)

todoRouter.get(
  "/",
  authenticate,
  validate(listTodosSchema),
  asyncHandler(todoController.listTodos),
);

todoRouter.get(
  "/:id",
  authenticate,
  asyncHandler(todoController.getTodoById)
);

todoRouter.patch(
  "/:id",
  authenticate,
  validate(updateTodoSchema),
  asyncHandler(todoController.updateTodo),
);


todoRouter.delete(
  "/:id",
  authenticate,
  validate(deleteTodoSchema),
  asyncHandler(todoController.deleteTodo),
);


