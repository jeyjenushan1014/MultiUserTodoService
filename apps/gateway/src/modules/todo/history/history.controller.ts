import type {
  RequestHandler,
} from "express";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";

import {
  getTodoHistory,
} from "../../../clients/todo-service.client.js";

import {
  getTodoParamsSchema,
} from "../get/get.todo.validation.js";

export const getTodoHistoryController: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const paramsResult =
      getTodoParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Request path parameters are invalid");
    }

    const identity = getCallerIdentity(response);

    const requestId = getRequestId();

    if (requestId === undefined) {
      throw new AppError(500, "REQUEST_CONTEXT_MISSING", "Request context is unavailable");
    }

    const result = await getTodoHistory(paramsResult.data.todoId, identity, requestId);

    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
