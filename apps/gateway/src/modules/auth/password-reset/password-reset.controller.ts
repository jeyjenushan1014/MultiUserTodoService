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

import {
  requestPasswordReset,
} from "../../../clients/account-service.client.js";

export async function passwordResetRequestController(
  request: Request<
    Record<string, never>,
    PasswordResetRequestedResponse,
    PasswordResetRequest
  >,
  response: Response<
    PasswordResetRequestedResponse
  >,
  next: NextFunction,
): Promise<void> {
  try {
    const requestId =
      getRequestId() ??
      "unavailable";

    const result =
      await requestPasswordReset(
        request.body,
        requestId,
      );

    response
      .status(202)
      .json(result);
  } catch (error) {
    next(error);
  }
}