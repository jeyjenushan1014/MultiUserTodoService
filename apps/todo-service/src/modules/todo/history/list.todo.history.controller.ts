import type {
  RequestHandler,
} from "express";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";
import {
  PostgresTodoHistoryRepository as RepoImpl,
} from "../../../history/todo-history.repository.js";

const repository = new RepoImpl();

export const listTodoHistoryController: RequestHandler =
  async (request, response, next) => {
    try {
      const identity =
        getInternalCallerIdentity(response);

      const todoIdParam = request.params.todoId;

      if (typeof todoIdParam !== "string") {
        throw new AppError(400, "VALIDATION_ERROR", "TODO identifier is invalid");
      }

      const requestId = getRequestId();

      if (requestId === undefined) {
        throw new AppError(500, "REQUEST_CONTEXT_MISSING", "Request context is unavailable");
      }

      const items = await repository.listAccessible(todoIdParam, identity.userId);

      response.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  };
