import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  CreateTodoRequest,
  CreateTodoResponse,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  createTodo,
} from "../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../middleware/authenticate.middleware.js";

export async function createTodoController(
  request: Request<
    Record<string, never>,
    CreateTodoResponse,
    CreateTodoRequest
  >,
  response:
    Response<CreateTodoResponse>,
  next: NextFunction,
): Promise<void> {
  try {
    const identity =
      getCallerIdentity(
        response,
      );

    const requestId =
      getRequestId() ??
      "unavailable";

    const result =
      await createTodo(
        request.body,
        identity,
        requestId,
      );

    response
      .status(201)
      .json(result);
  } catch (error) {
    next(error);
  }
}