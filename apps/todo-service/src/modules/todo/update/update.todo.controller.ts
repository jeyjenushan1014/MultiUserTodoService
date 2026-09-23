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
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  getValidatedParams,
} from "../../../middleware/validate-params.middleware.js";

import {
  PostgresUpdateTodoRepository,
} from "./postgres.update.todo.repository.js";

import {
  UpdateTodoService,
} from "./update.todo.service.js";

const repository =
  new PostgresUpdateTodoRepository();

const service =
  new UpdateTodoService(
    repository,
  );

export async function updateTodoController(
  request: Request,
  response: Response<UpdateTodoResponse>,
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
    request.body as UpdateTodoRequest;

  const todo =
    await service.execute(
      identity.userId,
      params.todoId,
      body,
    );

  response
    .status(200)
    .json(todo);
}