import {
  Router,
} from "express";


import {
  validateQuery,
} from "../../middleware/validate-query.middleware.js";

import {
  requireInternalIdentity,
} from "../../middleware/internal-service-auth.middleware.js";

import {
  validateBody,
} from "../../middleware/validate-body.middleware.js";

import {
  TodoController,
} from "./todo.controller.js";

import {
  PostgresTodoRepository,
} from "./todo.repository.js";

import {
  TodoService,
} from "./todo.service.js";

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
  listTodosQuerySchema,
} from "./list/list-todos.validation.js";

import {
  listTodosController,
} from "./list/list-todo.controller.js";

import {
  createTodoSchema,
} from "./todo.validation.js";

const repository =
  new PostgresTodoRepository();

const service =
  new TodoService(
    repository,
  );

const controller =
  new TodoController(
    service,
  );

export const todoRouter =
  Router();

todoRouter.post(
  "/",
  requireInternalIdentity,
  validateBody(
    createTodoSchema,
  ),
  controller.create,
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