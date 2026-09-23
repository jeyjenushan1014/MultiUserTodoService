import type {
  RequestHandler,
} from "express";

import type {
  ShareTodoResponse,
} from "@todo/contracts";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  resolveAccountByEmail,
} from "../../../clients/account-service.client.js";

import {
  shareTodo,
} from "../../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";

import {
  getTodoParamsSchema,
} from "../get/get.todo.validation.js";

import {
  shareTodoBodySchema,
} from "./share-todo.validation.js";

export const shareTodoController:
  RequestHandler = async (
    request,
    response,
    next,
  ): Promise<void> => {
    try {
      /*
       * These values were already checked by the
       * route validation middleware.
       *
       * Parsing here gives TypeScript the correct,
       * safe types without using unsafe casts.
       */
      const paramsResult =
        getTodoParamsSchema.safeParse(
          request.params,
        );

      if (!paramsResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Request path parameters are invalid",
        );
      }

      const bodyResult =
        shareTodoBodySchema.safeParse(
          request.body,
        );

      if (!bodyResult.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Request body is invalid",
        );
      }

      const identity =
        getCallerIdentity(
          response,
        );

      const requestId =
        getRequestId();

      if (requestId === undefined) {
        throw new AppError(
          500,
          "REQUEST_CONTEXT_MISSING",
          "Request context is unavailable",
        );
      }

      /*
       * Account Service owns account information.
       * Gateway converts the public email into the
       * internal stable account UUID.
       */
      const resolvedAccount =
        await resolveAccountByEmail(
          {
            email:
              bodyResult.data
                .recipientEmail,
          },
          requestId,
        );

      /*
       * TODO Service receives only the stable
       * recipient account identifier.
       */
      const result:
        ShareTodoResponse =
        await shareTodo(
          paramsResult.data.todoId,
          {
            recipientId:
              resolvedAccount
                .data
                .account
                .id,
          },
          identity,
          requestId,
        );

      response
        .status(201)
        .json(result);
    } catch (error) {
      next(error);
    }
  };