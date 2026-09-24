import type {
  Request,
  Response,
} from "express";

import type {
  GetTodoParams,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  deleteTodoById,
} from "../../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";

import {
  getValidatedParams,
} from "../../../middleware/validate-params.middleware.js";

export async function deleteTodoController(
  request: Request,
  response: Response,
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

  await deleteTodoById(
    params.todoId,
    identity,
    requestId,
  );

  response
    .status(204)
    .send();
}