import type {
  RequestHandler,
} from "express";

import type {
  ZodType,
} from "zod";

import {
  AppError,
} from "@todo/common";

export function validateBody<T>(
  schema: ZodType<T>,
): RequestHandler {
  return (
    request,
    _response,
    next,
  ): void => {
    const result =
      schema.safeParse(request.body);

    if (!result.success) {
      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed",
          result.error.issues.map(
            (issue) => ({
              field:
                issue.path.join("."),
              message:
                issue.message,
            }),
          ),
        ),
      );

      return;
    }

    request.body = result.data;
    next();
  };
}