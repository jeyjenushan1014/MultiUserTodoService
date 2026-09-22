import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  ZodType,
} from "zod";

import {
  ZodError,
} from "zod";

import type {
  ErrorDetail,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

function mapValidationDetails(
  error: ZodError,
): readonly ErrorDetail[] {
  return error.issues.map(
    (issue) => ({
      field:
        issue.path.join("."),

      message:
        issue.message,
    }),
  );
}

export function validateBody<T>(
  schema: ZodType<T>,
) {
  return (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void => {
    try {
      request.body =
        schema.parse(
          request.body,
        );

      next();
    } catch (error) {
      if (
        error instanceof ZodError
      ) {
        next(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "Request validation failed",
            mapValidationDetails(
              error,
            ),
          ),
        );

        return;
      }

      next(error);
    }
  };
}