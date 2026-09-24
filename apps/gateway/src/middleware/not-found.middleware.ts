import type {
  RequestHandler,
} from "express";

import {
  AppError,
} from "@todo/common";

export const notFoundMiddleware:
  RequestHandler = (
    request,
    _response,
    next,
  ): void => {
    next(
      new AppError(
        404,
        "ROUTE_NOT_FOUND",
        `Route ${request.method} ${request.path} was not found`,
      ),
    );
  };