
/*
This file explain the error handling middleware for an application.
It exports two middleware functions: routeNotFoundHandler and errorHandler.
This file can handle the errors that occur during the processing of requests in an Express.js application.

*/


import type { ErrorRequestHandler, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { AppError } from "../shared/app-error.js";
import { logger } from "../config/logger.js";

export const routeNotFoundHandler: RequestHandler = (
  _request,
  _response,
  next,
) => {
  next(
    new AppError(
      404,
      "ROUTE_NOT_FOUND",
      "Route not found",
    ),
  );
};

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  void next;

  const suppliedRequestId =
    request.header("x-request-id");
  const requestId =
    suppliedRequestId !== undefined &&
    /^[A-Za-z0-9._-]{1,100}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined
          ? {}
          : { details: error.details }),
        requestId,
      },
    });

    return;
  }

  logger.error(
    {
      error,
      requestId,
    },
    "Unhandled internal error",
  );

  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId,
    },
  });
};