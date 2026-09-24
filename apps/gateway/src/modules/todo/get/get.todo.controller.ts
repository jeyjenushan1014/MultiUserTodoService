import type {
  Request,
  Response,
} from "express";

import type {
  GetTodoParams,
  GetTodoResponse,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  getTodoById,
} from "../../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";

import {
  getValidatedParams,
} from "../../../middleware/validate-params.middleware.js";

export async function getTodoController(
  request: Request,
  response:
    Response<GetTodoResponse>,
): Promise<void> {
  void request;

  const identity =
    getCallerIdentity(
      response,
    );

  const params =
  getValidatedParams(
    response,
  ) as GetTodoParams;

  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new Error(
      "Request ID context is unavailable",
    );
  }

  const todo =
    await getTodoById(
      params.todoId,
      identity,
      requestId,
    );

  response
    .status(200)
    .json(todo);
}