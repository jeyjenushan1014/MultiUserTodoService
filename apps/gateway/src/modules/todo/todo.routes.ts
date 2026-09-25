import {
  Router,
} from "express";

import {
  authenticate,
} from "../../middleware/authenticate.middleware.js";



import {
  shareTodoController,
} from "./share/share-todo.controller.js";

import {
  withdrawTodoShareController,
} from "./share/withdraw/withdraw.todo.share.controller.js";

import {
  withdrawTodoShareParamsSchema,
} from "./share/withdraw/withdraw.todo.share.validation.js";

import {
  shareTodoBodySchema,
} from "./share/share-todo.validation.js";

import {
  validateBody,
} from "../../middleware/validate-body.middleware.js";

import {
  validateParams,
} from "../../middleware/validate-params.middleware.js";

import {
  validateQuery,
} from "../../middleware/validate-query.middleware.js";

import {
  deleteTodoController,
} from "./delete/delete.todo.controller.js";

import {
  getTodoController,
} from "./get/get.todo.controller.js";

import {
  getTodoHistoryController,
} from "./history/history.controller.js";

import {
  getTodoParamsSchema,
} from "./get/get.todo.validation.js";

import {
  listTodosQuerySchema,
} from "./list/list-todos.validation.js";

import {
  listTodosController,
} from "./list/todo.controller.js";

import {
  createTodoController,
} from "./todo.controller.js";

import {
  createTodoSchema,
} from "./todo.validation.js";

import {
  updateTodoController,
} from "./update/update.todo.controller.js";

import {
  updateTodoBodySchema,
} from "./update/update.todo.validation.js";

export const todoRouter =
  Router();

/*
 * Every TODO operation requires a valid
 * authenticated user.
 *
 * Applying authentication at router level
 * prevents any protected controller from
 * executing without authentication context.
 */
todoRouter.use(
  authenticate,
);

todoRouter.post(
  "/",
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

todoRouter.post(
  "/:todoId/shares",
  validateParams(
    getTodoParamsSchema,
  ),
  validateBody(
    shareTodoBodySchema,
  ),
  shareTodoController,
);

todoRouter.delete(
  "/:todoId/shares/:recipientId",
  validateParams(
    withdrawTodoShareParamsSchema,
  ),
  withdrawTodoShareController,
);

todoRouter.get(
  "/:todoId",
  validateParams(
    getTodoParamsSchema,
  ),
  getTodoController,
);

todoRouter.get(
  "/:todoId/history",
  validateParams(
    getTodoParamsSchema,
  ),
  getTodoHistoryController,
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