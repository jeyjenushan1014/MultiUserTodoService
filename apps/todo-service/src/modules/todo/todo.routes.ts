import {
  Router,
} from "express";

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