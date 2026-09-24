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

import {
  confirmPasswordReset,
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

export async function confirmPasswordResetController(
  request: Request<
    Record<string, never>,
    void,
    ConfirmPasswordResetRequest
  >,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const requestId =
      getRequestId() ??
      "unavailable";

    await confirmPasswordReset(
      request.body,
      requestId,
    );

    response
      .status(204)
      .send();
  } catch (error) {
    next(error);
  }
}