import type {
  RequestHandler,
} from "express";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  getCurrentAccount,
  exportAccount as exportAccountFromService,
  requestAccountDeletion as requestAccountDeletionFromService,
} from "../../../clients/account-service.client.js";
import { exportAccountTodos } from "../../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";

import {
  cacheAccountRevoked,
} from "../../../security/session-revocation.cache.js";

export const getMe:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const requestId =
      getRequestId();

    if (requestId === undefined) {
      throw new Error(
        "Request context is unavailable",
      );
    }

    const result =
      await getCurrentAccount(
        identity,
        requestId,
      );

    response
      .status(200)
      .json(result);
  };

export const requestAccountDeletion: RequestHandler = async (
  request,
  response,
): Promise<void> => {
  const identity = getCallerIdentity(response);
  const requestId = getRequestId();
  const idempotencyKey = request.header("idempotency-key");

  if (requestId === undefined) {
    throw new Error("Request context is unavailable");
  }
  if (idempotencyKey === undefined || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required");
  }

  const result = await requestAccountDeletionFromService(identity, idempotencyKey, requestId);
  await cacheAccountRevoked(identity.userId, Math.floor(Date.now() / 1000));
  response.status(202).json(result);
};

export const exportAccount: RequestHandler = async (_request, response): Promise<void> => {
  const identity = getCallerIdentity(response);
  const requestId = getRequestId();
  if (requestId === undefined) {
    throw new Error("Request context is unavailable");
  }
  const [account, todos] = await Promise.all([
    exportAccountFromService(identity, requestId),
    exportAccountTodos(identity, requestId),
  ]);
  response.status(200).json({
    data: {
      generatedAt: account.data.generatedAt,
      account: account.data.account,
      workspaces: account.data.workspaces,
      todos: todos.data.todos,
      shares: todos.data.shares,
      history: todos.data.history,
    },
  });
};