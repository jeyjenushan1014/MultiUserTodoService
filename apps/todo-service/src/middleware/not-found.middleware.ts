import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  AppError,
} from "@todo/common";

export function notFoundMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(
    new AppError(
      404,
      "ROUTE_NOT_FOUND",
      `Route ${request.method} ${request.originalUrl} was not found`,
    ),
  );
}