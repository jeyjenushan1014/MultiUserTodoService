import type {
  Request,
  Response,
} from "express";

import type {
  WithdrawTodoShareParams,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  getInternalCallerIdentity,
} from "../../../../middleware/internal-service-auth.middleware.js";

import {
  getValidatedParams,
} from "../../../../middleware/validate-params.middleware.js";

import {
  RedisTodoCacheInvalidator,
} from "../../cache/redis.todo.cache.invalidator.js";

import {
  PostgresWithdrawTodoShareRepository,
} from "./postgres.withdraw.todo.share.repository.js";

import {
  WithdrawTodoShareService,
} from "./withdraw.todo.share.service.js";

const repository =
  new PostgresWithdrawTodoShareRepository();

const cacheInvalidator =
  new RedisTodoCacheInvalidator();

const service =
  new WithdrawTodoShareService(
    repository,
    cacheInvalidator,
  );

export async function withdrawTodoShareController(
  request: Request,
  response:
    Response,
): Promise<void> {
  void request;

  const identity =
    getInternalCallerIdentity(
      response,
    );

  const params =
    getValidatedParams(
      response,
    ) as WithdrawTodoShareParams;

  const requestId =
    getRequestId();

  if (
    requestId ===
    undefined
  ) {
    throw new Error(
      "Request context is unavailable",
    );
  }

  await service.execute({
    ownerId:
      identity.userId,

    todoId:
      params.todoId,

    recipientId:
      params.recipientId,

    requestId,
  });

  response
    .status(204)
    .send();
}