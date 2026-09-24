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
  IDEMPOTENCY_KEY_HEADER,
  normalizeIdempotencyKey,
} from "@todo/common";

import {
  getInternalCallerIdentity,
} from "../../../middleware/internal-service-auth.middleware.js";

import type {
  InternalIdentityLocals,
} from "../../../middleware/internal-service-auth.middleware.js";

import type {
  CreateTodoService,
} from "./create.todo.service.js";

type CreateTodoHttpResponse =
  Response<
    CreateTodoResponse,
    InternalIdentityLocals
  >;

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

export class CreateTodoController {
  public constructor(
    private readonly service:
      CreateTodoService,
  ) {}

  public create = async (
    request: Request<
      Record<string, never>,
      CreateTodoResponse,
      CreateTodoRequest
    >,
    response:
      CreateTodoHttpResponse,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const identity =
        getInternalCallerIdentity(
          response,
        );

      const idempotencyKey =
        requireIdempotencyKey(
          request,
        );

      const result =
        await this.service
          .execute({
            ownerId:
              identity.userId,

            idempotencyKey,

            request:
              request.body,
          });

      /*
       * Returning 201 for both the original request
       * and a replay keeps the public operation
       * deterministic.
       */
      response
        .status(201)
        .json(result);
    } catch (error) {
      next(error);
    }
  };
}