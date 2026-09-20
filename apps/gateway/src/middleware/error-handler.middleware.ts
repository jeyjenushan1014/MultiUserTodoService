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
    _request,
    response,
    next,
  ): void => {

    /*
    Express requires four parameter  to identify this function 
    as  error-handling middleware
    */
   void next;


    const requestId =
      getRequestId() ??
      "unavailable";

    if (error instanceof AppError) {
      logger.warn(
        {
          errorCode: error.code,
          statusCode:
            error.statusCode,
          requestId,
        },
        error.message,
      );

      response
        .status(error.statusCode)
        .json(
          createErrorResponse(
            error.code,
            error.message,
            requestId,
            error.details,
          ),
        );

      return;
    }

    if (isExpressBodyError(error)) {
      if (
        error.type ===
        "entity.parse.failed"
      ) {
        response
          .status(400)
          .json(
            createErrorResponse(
              "INVALID_JSON",
              "Request body contains invalid JSON",
              requestId,
            ),
          );

        return;
      }

      if (
        error.type ===
        "entity.too.large"
      ) {
        response
          .status(413)
          .json(
            createErrorResponse(
              "PAYLOAD_TOO_LARGE",
              "Request body is too large",
              requestId,
            ),
          );

        return;
      }
    }

    logger.error(
      {
        error,
        requestId,
      },
      "Unhandled request error",
    );

    response
      .status(500)
      .json(
        createErrorResponse(
          "INTERNAL_SERVER_ERROR",
          "An unexpected error occurred",
          requestId,
        ),
      );
  };