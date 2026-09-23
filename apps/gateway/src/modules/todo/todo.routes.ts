
import {
  Router,
} from "express";

import {
  listTodosQuerySchema,
} from "../todo/list/list-todos.validation.js";

import {
  authenticate,
} from "../../middleware/authenticate.middleware.js";

import {
  validateBody,
} from "../../middleware/validate-body.middleware.js";

import {
  createTodoController,
} from "./todo.controller.js";

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