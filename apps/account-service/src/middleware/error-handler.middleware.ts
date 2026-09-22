import {
  randomUUID,
} from "node:crypto";

import type {
  ErrorRequestHandler,
} from "express";

import type {
  ErrorDetail,
  ErrorResponse,
} from "@todo/contracts";

import {
  AppError,
  getRequestId,
} from "@todo/common";

import {
  logger,
} from "../config/logger.js";

interface ExpressBodyError {
  readonly type?: unknown;
  readonly status?: unknown;
  readonly statusCode?: unknown;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isExpressBodyError(
  error: unknown,
): error is ExpressBodyError {
  return isObject(error);
}

function isErrorDetail(
  value: unknown,
): value is ErrorDetail {
  if (!isObject(value)) {
    return false;
  }

  const field = value.field;
  const message = value.message;

  return (
    (
      field === undefined ||
      typeof field === "string"
    ) &&
    typeof message === "string"
  );
}

function getErrorDetails(
  details: unknown,
): readonly ErrorDetail[] | undefined {
  if (!Array.isArray(details)) {
    return undefined;
  }

  if (!details.every(isErrorDetail)) {
    return undefined;
  }

  return details;
}

function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: readonly ErrorDetail[],
): ErrorResponse {
  if (details === undefined) {
    return {
      error: {
        code,
        message,
        requestId,
      },
    };
  }

  return {
    error: {
      code,
      message,
      requestId,
      details,
    },
  };
}

export const errorHandlerMiddleware:
  ErrorRequestHandler = (
    error: unknown,
    request,
    response,
    next,
  ): void => {
    /*
     * Express requires four parameters to identify
     * this function as error-handling middleware.
     */
    void next;

    const requestId =
      getRequestId() ??
      randomUUID();

    response.setHeader(
      "X-Request-ID",
      requestId,
    );

    /*
     * Handle a request body that exceeds the
     * express.json() configured size limit.
     */
    if (
      isExpressBodyError(error) &&
      (
        error.type ===
          "entity.too.large" ||
        error.status === 413 ||
        error.statusCode === 413
      )
    ) {
      const responseBody =
        createErrorResponse(
          "PAYLOAD_TOO_LARGE",
          "Request body is too large",
          requestId,
        );

      response
        .status(413)
        .json(responseBody);

      return;
    }

    /*
     * Handle malformed JSON.
     */
    if (
      isExpressBodyError(error) &&
      error.type ===
        "entity.parse.failed"
    ) {
      const responseBody =
        createErrorResponse(
          "INVALID_JSON",
          "Request body contains invalid JSON",
          requestId,
        );

      response
        .status(400)
        .json(responseBody);

      return;
    }

    /*
     * Handle expected application errors.
     *
     * Examples:
     * - validation error
     * - duplicate email
     * - internal authentication failure
     */
    if (error instanceof AppError) {
      const appError = error;

      const details =
        getErrorDetails(
          appError.details,
        );

      logger.warn(
        {
          errorCode:
            appError.code,

          statusCode:
            appError.statusCode,

          requestId,

          method:
            request.method,

          path:
            request.originalUrl,
        },
        appError.message,
      );

      const responseBody =
        createErrorResponse(
          appError.code,
          appError.message,
          requestId,
          details,
        );

      response
        .status(appError.statusCode)
        .json(responseBody);

      return;
    }

    /*
     * Log the complete unexpected error internally.
     *
     * The property must be named `err` so that
     * Pino serializes Error.message and Error.stack.
     */
    logger.error(
      {
        err: error,
        requestId,
        method:
          request.method,
        path:
          request.originalUrl,
      },
      "Unhandled Account Service error",
    );

    /*
     * Do not return the original error, stack trace,
     * SQL statement or database error to the client.
     */
    const responseBody =
      createErrorResponse(
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred",
        requestId,
      );

    response
      .status(500)
      .json(responseBody);
  };