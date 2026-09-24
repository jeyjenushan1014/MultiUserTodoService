import type {
  Request,
  Response,
} from "express";

import type {
  GetTodoParams,
  UpdateTodoRequest,
  UpdateTodoResponse,
} from "@todo/contracts";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  getValidatedParams,
} from "../../../middleware/validate-params.middleware.js";

import {
  CacheInvalidatingUpdateTodoService,
} from "../cache/cache.invalidating.update.todo.service.js";

import {
  RedisTodoCacheInvalidator,
} from "../cache/redis.todo.cache.invalidator.js";

import {
  PostgresUpdateTodoRepository,
} from "./postgres.update.todo.repository.js";

import {
  UpdateTodoService,
} from "./update.todo.service.js";

const repository =
  new PostgresUpdateTodoRepository();

const baseService =
  new UpdateTodoService(
    repository,
  );

const cacheInvalidator =
  new RedisTodoCacheInvalidator();

const service =
  new CacheInvalidatingUpdateTodoService(
    baseService,
    cacheInvalidator,
  );

export async function updateTodoController(
  request: Request,
  response:
    Response<UpdateTodoResponse>,
): Promise<void> {
  const identity =
    getInternalCallerIdentity(
      response,
    );

  const params =
    getValidatedParams(
      response,
    ) as GetTodoParams;

  const body =
    request.body as
      UpdateTodoRequest;

  const requestId =
    getRequestId();

  if (
    requestId ===
    undefined
  ) {
    throw new AppError(
      500,
      "REQUEST_CONTEXT_MISSING",
      "Request context is unavailable",
    );
  }

  const todo =
    await service.execute(
      identity.userId,
      params.todoId,
      body,
      requestId,
    );

  response
    .status(200)
    .json(todo);
}