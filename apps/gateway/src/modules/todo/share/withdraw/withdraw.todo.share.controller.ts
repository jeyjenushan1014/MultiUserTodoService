import type {
  RequestHandler,
} from "express";

import type {
  WithdrawTodoShareParams,
} from "@todo/contracts";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  withdrawTodoShare,
} from "../../../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../../../middleware/authenticate.middleware.js";

import {
  getValidatedParams,
} from "../../../../middleware/validate-params.middleware.js";

export const withdrawTodoShareController:
  RequestHandler = async (
    request,
    response,
    next,
  ): Promise<void> => {
    try {
      void request;

      const identity =
        getCallerIdentity(
          response,
        );

        const params =
        getValidatedParams(
          response,
        ) as WithdrawTodoShareParams;

      const requestId =
        getRequestId();

      if (requestId === undefined) {
        throw new AppError(
          500,
          "REQUEST_CONTEXT_MISSING",
          "Request context is unavailable",
        );
      }

      await withdrawTodoShare(
        params.todoId,
        params.recipientId,
        identity,
        requestId,
      );

      response
        .status(204)
        .send();
    } catch (error) {
      next(error);
    }
  };