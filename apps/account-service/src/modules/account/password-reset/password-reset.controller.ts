import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  ConfirmPasswordResetRequest,
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

  public confirmReset = async (
    request: Request<
      Record<string, never>,
      void,
      ConfirmPasswordResetRequest
    >,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const requestId =
        getRequestId() ??
        "unavailable";

      await this.service.confirmReset({
        token:
          request.body.token,
        newPassword:
          request.body.newPassword,
        requestId,
      });

      response
        .status(204)
        .send();
    } catch (error) {
      next(error);
    }
  };
}