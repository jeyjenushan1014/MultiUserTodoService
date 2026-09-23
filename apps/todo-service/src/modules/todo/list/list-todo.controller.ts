import type {
  Request,
  Response,
} from "express";

import type {
  ListTodosQuery,
  ListTodosResponse,
} from "@todo/contracts";

import {
  getValidatedQuery,
} from "../../../middleware/validate-query.middleware.js";

import {
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";

import type {
  InternalIdentityLocals,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  PostgresListTodosRepository,
} from "./postgres-list-todos.repository.js";

import {
  ListTodosService,
} from "./list-todo.service.js";

const repository =
  new PostgresListTodosRepository();

const service =
  new ListTodosService(
    repository,
  );

export async function listTodosController(
  _request: Request,
  response:
    Response<
      ListTodosResponse,
      InternalIdentityLocals
    >,
): Promise<void> {
  const identity =
    getInternalCallerIdentity(
      response,
    );

  const query =
    getValidatedQuery(
      response,
    ) as ListTodosQuery;

  const result =
    await service.execute(
      identity.userId,
      query,
    );

  response
    .status(200)
    .json(result);
}