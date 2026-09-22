import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  PasswordResetRequest,
  PasswordResetRequestedResponse,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import type {
  PasswordResetService,
} from "./password-reset.service.js";

export class PasswordResetController {
  public constructor(
    private readonly service:
      PasswordResetService,
  ) {}

  public requestReset = async (
    request: Request<
      Record<string, never>,
      PasswordResetRequestedResponse,
      PasswordResetRequest
    >,
    response: Response<
      PasswordResetRequestedResponse
    >,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const requestId =
        getRequestId() ??
        "unavailable";

      const result =
        await this.service.requestReset({
          email:
            request.body.email,
          requestId,
        });

      response
        .status(202)
        .json(result);
    } catch (error) {
      next(error);
    }
  };
}