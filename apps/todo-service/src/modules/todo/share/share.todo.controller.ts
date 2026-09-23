import type {
  RequestHandler,
} from "express";

import type {
  CreateTodoShareRequest,
  ShareTodoResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import {
  getRequestId,
} from "@todo/common";

import {
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  PostgresShareTodoRepository,
} from "./share.todo.repository.js";

import {
  ShareTodoService,
} from "./share.todo.service.js";

const repository =
  new PostgresShareTodoRepository();

const service =
  new ShareTodoService(
    repository,
  );

export const shareTodoController:
  RequestHandler = async (
    request,
    response,
    next,
  ): Promise<void> => {
    try {
      const identity =
        getInternalCallerIdentity(
          response,
        );

      /*
       * validateParams already validated todoId.
       * validateBody already validated and replaced request.body.
       */
    const todoIdParameter =
  request.params.todoId;

if (
  typeof todoIdParameter !==
  "string"
) {
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "TODO identifier is invalid",
  );
}

const todoId =
  todoIdParameter;

      const body =
        request.body as
          CreateTodoShareRequest;

      const requestId =
        getRequestId();

      if (
        todoId === undefined ||
        requestId === undefined
      ) {
        throw new Error(
          "Required request context is unavailable",
        );
      }

      const result:
        ShareTodoResponse =
        await service.execute({
          todoId,
          ownerId:
            identity.userId,
          recipientId:
            body.recipientId,
          requestId,
        });

      response
        .status(201)
        .json(result);
    } catch (error) {
      next(error);
    }
  };