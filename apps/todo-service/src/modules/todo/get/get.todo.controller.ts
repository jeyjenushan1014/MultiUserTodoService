import type {
  Request,
  Response,
} from "express";

import type {
  GetTodoParams,
  GetTodoResponse,
} from "@todo/contracts";

import {
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  getValidatedParams,
} from "../../../middleware/validate-params.middleware.js";

import {
  CachedGetTodoRepository,
} from "../cache/cached.get.todo.repository.js";

import {
  RedisTodoReadCache,
} from "../cache/redis.todo.read.cache.js";

import {
  GetTodoService,
} from "./get.todo.service.js";

import {
  PostgresGetTodoRepository,
} from "./postgres.get.todo.repository.js";

const postgresRepository =
  new PostgresGetTodoRepository();

const readCache =
  new RedisTodoReadCache();

const repository =
  new CachedGetTodoRepository(
    postgresRepository,
    readCache,
  );

const service =
  new GetTodoService(
    repository,
  );

export async function getTodoController(
  request: Request,
  response:
    Response<GetTodoResponse>,
): Promise<void> {
  void request;

  const identity =
    getInternalCallerIdentity(
      response,
    );

  const params =
  getValidatedParams(
    response,
  ) as GetTodoParams;

  const todo =
    await service.execute(
      identity.userId,
      params.todoId,
    );

  response
    .status(200)
    .json(todo);
}