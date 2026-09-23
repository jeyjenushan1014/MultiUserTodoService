import {
  Router,
} from "express";

import {
  updateTodoController,
} from "./update/update.todo.controller.js";

import {
  shareTodoController,
} from "./share/share.todo.controller.js";

import {
  createTodoShareBodySchema,
} from "./share/share.todo.validation.js";

import {
  updateTodoBodySchema,
} from "./update/update.todo.validation.js";

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
  CreateTodoController,
} from "./create/create.todo.controller.js";

import {
  deleteTodoController,
} from "./delete/delete.todo.controller.js";

import {
  PostgresTodoRepository,
} from "./create/create.todo.repository.js";

import {
  CreateTodoService,
} from "./create/create.todo.service.js"

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


import {
  RedisTodoCacheInvalidator,
} from "./cache/redis.todo.cache.invalidator.js";

export const todoRouter =
  Router();

const todoRepository =
  new PostgresTodoRepository();

const cacheInvalidator =
  new RedisTodoCacheInvalidator();

const createTodoService =
  new CreateTodoService(
    todoRepository,
    cacheInvalidator,
  );

const createTodoController =
  new CreateTodoController(
    createTodoService,
  );

todoRouter.use(
  requireInternalIdentity,
);

todoRouter.post(
  "/",
  validateBody(
    createTodoSchema,
  ),
  createTodoController.create,
);

todoRouter.get(
  "/",
  validateQuery(
    listTodosQuerySchema,
  ),
  listTodosController,
);

todoRouter.post(
  "/:todoId/shares",
  validateParams(
    getTodoParamsSchema,
  ),
  validateBody(
    createTodoShareBodySchema,
  ),
  shareTodoController,
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