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

      const result =
        await this.service
          .execute({
            ownerId:
              identity.userId,

            request:
              request.body,
          });

      response
        .status(201)
        .json(result);
    } catch (error) {
      next(error);
    }
  };
}