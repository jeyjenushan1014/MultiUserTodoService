import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  CreateTodoRequest,
  CreateTodoResponse,
} from "@todo/contracts";

import {
  AppError,
  getRequestId,
  IDEMPOTENCY_KEY_HEADER,
  normalizeIdempotencyKey,
} from "@todo/common";

import {
  createTodo,
} from "../../clients/todo-service.client.js";

import {
  getCallerIdentity,
} from "../../middleware/authenticate.middleware.js";

function requireIdempotencyKey(
  request: Request,
): string {
  const idempotencyKey =
    normalizeIdempotencyKey(
      request.get(
        IDEMPOTENCY_KEY_HEADER,
      ),
    );

  if (
    idempotencyKey ===
    undefined
  ) {
    throw new AppError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "A valid Idempotency-Key header is required",
    );
  }

  return idempotencyKey;
}

export async function createTodoController(
  request: Request<
    Record<string, never>,
    CreateTodoResponse,
    CreateTodoRequest
  >,
  response:
    Response<CreateTodoResponse>,
  next:
    NextFunction,
): Promise<void> {
  try {
    const identity =
      getCallerIdentity(
        response,
      );

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

    const idempotencyKey =
      requireIdempotencyKey(
        request,
      );

    const result =
      await createTodo(
        request.body,
        identity,
        requestId,
        idempotencyKey,
      );

    response
      .status(201)
      .json(result);
  } catch (error) {
    next(error);
  }
}