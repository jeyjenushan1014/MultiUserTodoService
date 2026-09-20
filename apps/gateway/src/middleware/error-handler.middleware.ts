import {
  randomUUID,
} from "node:crypto";

import type {
  ErrorRequestHandler,
} from "express";

import type {
  ErrorResponse,
} from "@todo/contracts";

import {
  AppError,
  getRequestContext,
} from "@todo/common";

import {
  logger,
} from "../config/logger.js";

export const errorHandler:
ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
): void => {
  const requestId =
    getRequestContext()?.requestId ??
    randomUUID();

  const applicationError =
    error instanceof AppError
      ? error
      : new AppError(
          500,
          "INTERNAL_ERROR",
          "An unexpected error occurred",
        );

  if (!(error instanceof AppError)) {
    logger.error(
      {
        error,
      },
      "Unhandled Gateway error",
    );
  }

  if (
    applicationError.statusCode === 429 &&
    typeof applicationError.details ===
      "object" &&
    applicationError.details !== null &&
    "retryAfterSeconds" in
      applicationError.details
  ) {
    const details =
      applicationError.details as {
        retryAfterSeconds: number;
      };

    response.setHeader(
      "Retry-After",
      String(details.retryAfterSeconds),
    );
  }

  const body: ErrorResponse = {
    error: {
      code: applicationError.code,
      message:
        applicationError.message,
      requestId,
    },
  };

  response
    .status(
      applicationError.statusCode,
    )
    .json(body);
};