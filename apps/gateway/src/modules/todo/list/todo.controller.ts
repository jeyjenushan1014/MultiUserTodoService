import type {
  Request,
  Response,
} from "express";

import type {
  ListTodosQuery,
  ListTodosResponse,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  listTodos,
} from "../../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";

import {
  getValidatedQuery,
} from "../../../middleware/validate-query.middleware.js";

export async function listTodosController(
  _request: Request,
  response:
    Response<ListTodosResponse>,
): Promise<void> {
  void _request;

  const identity =
    getCallerIdentity(
      response,
    );

  const query =
    getValidatedQuery(
      response,
    ) as ListTodosQuery;

  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new Error(
      "Request ID context is unavailable",
    );
  }

  const result =
    await listTodos(
      query,
      identity,
      requestId,
    );

  response
    .status(200)
    .json(result);
}