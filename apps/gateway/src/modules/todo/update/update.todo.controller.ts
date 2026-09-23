import type {
  Request,
  Response,
} from "express";

import type {
  GetTodoParams,
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  updateTodo,
} from "../../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";



import {
  getValidatedParams,
} from "../../../middleware/validate-params.middleware.js";

export async function updateTodoController(
  request: Request,
  response:
    Response<UpdateTodoResponse>,
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

   const body =
    request.body as UpdateTodoRequest;

  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new Error(
      "Request ID context is unavailable",
    );
  }

  const todo =
    await updateTodo(
      params.todoId,
      body,
      identity,
      requestId,
    );

  response
    .status(200)
    .json(todo);
}