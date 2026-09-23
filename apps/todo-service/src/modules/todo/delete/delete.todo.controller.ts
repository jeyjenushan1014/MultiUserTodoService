import type {
  Request,
  Response,
} from "express";

import type {
  GetTodoParams,
} from "@todo/contracts";

import {
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  getValidatedParams,
} from "../../../middleware/validate-params.middleware.js";

import {
  DeleteTodoService,
} from "./delete.todo.service.js";

import {
  PostgresDeleteTodoRepository,
} from "./postgres.delete.todo.repository.js";

const repository =
  new PostgresDeleteTodoRepository();

const service =
  new DeleteTodoService(
    repository,
  );

export async function deleteTodoController(
  request: Request,
  response: Response,
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

  await service.execute(
    identity.userId,
    params.todoId,
  );

  response
    .status(204)
    .send();
}