import type {
  RequestHandler,
} from "express";

import type {
  CreateTodoShareRequest,
  ShareTodoResponse,
} from "@todo/contracts";

import {
  AppError,
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
       * Express defines a route parameter as
       * string | string[]. Narrow it to string.
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

      const body =
        request.body as
          CreateTodoShareRequest;

      const requestId =
        getRequestId();

      if (requestId === undefined) {
        throw new AppError(
          500,
          "REQUEST_CONTEXT_MISSING",
          "Request context is unavailable",
        );
      }

      const result:
        ShareTodoResponse =
        await service.execute({
          todoId:
            todoIdParameter,

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