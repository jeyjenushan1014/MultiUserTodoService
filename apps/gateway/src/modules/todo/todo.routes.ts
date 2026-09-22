import {
  Router,
} from "express";

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