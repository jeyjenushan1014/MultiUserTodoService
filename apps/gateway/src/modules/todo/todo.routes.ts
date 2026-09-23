
import {
  Router,
} from "express";

import {
  listTodosQuerySchema,
} from "../todo/list/list-todos.validation.js";

import {
  deleteTodoController,
} from "./delete/delete.todo.controller.js";

import {
  authenticate,
} from "../../middleware/authenticate.middleware.js";

import {
  validateParams,
} from "../../middleware/validate-params.middleware.js";

import {
  getTodoController,
} from "./get/get.todo.controller.js";

import {
  getTodoParamsSchema,
} from "./get/get.todo.validation.js";

import {
  validateBody,
} from "../../middleware/validate-body.middleware.js";

import {
  createTodoController,
} from "./todo.controller.js";

import {
  updateTodoController,
} from "./update/update.todo.controller.js";

import {
  updateTodoBodySchema,
} from "./update/update.todo.validation.js";

import {
  createTodoSchema,
} from "./todo.validation.js";
import { validateQuery } from "../../middleware/validate-query.middleware.js";
import { listTodosController } from "./list/todo.controller.js";

export const todoRouter =
  Router();

todoRouter.post(
  "/",
  authenticate,
  validateBody(
    createTodoSchema,
  ),
  createTodoController,
);


todoRouter.get(
  "/",
  validateQuery(
    listTodosQuerySchema,
  ),
  listTodosController,
);

todoRouter.get(
  "/:todoId",
  validateParams(
    getTodoParamsSchema,
  ),
  getTodoController,
);

todoRouter.patch(
  "/:todoId",
  validateParams(
    getTodoParamsSchema,
  ),
  validateBody(
    updateTodoBodySchema,
  ),
  updateTodoController,
);

todoRouter.delete(
  "/:todoId",
  validateParams(
    getTodoParamsSchema,
  ),
  deleteTodoController,
);