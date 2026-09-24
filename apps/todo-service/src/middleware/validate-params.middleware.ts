import type {
  RequestHandler,
  Response,
} from "express";

import type {
  ZodType,
} from "zod";

import type {
  ErrorDetail,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

const VALIDATED_PARAMS_KEY =
  "validatedParams";

export function validateParams<T>(
  schema: ZodType<T>,
): RequestHandler {
  return (
    request,
    response,
    next,
  ): void => {
    const result =
      schema.safeParse(
        request.params,
      );

    if (!result.success) {
      const details:
        readonly ErrorDetail[] =
        result.error.issues.map(
          (issue) => ({
            field:
              issue.path.join(".") ||
              "params",

            message:
              issue.message,
          }),
        );

      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Request path parameters are invalid",
          details,
        ),
      );

      return;
    }

    const locals =
      response.locals as Record<
        string,
        unknown
      >;

    locals[VALIDATED_PARAMS_KEY] =
      result.data;

    next();
  };
}

export function getValidatedParams(
  response: Response,
): unknown {
  const locals =
    response.locals as Record<
      string,
      unknown
    >;

  const value =
    locals[VALIDATED_PARAMS_KEY];

  if (value === undefined) {
    throw new AppError(
      500,
      "VALIDATED_PARAMS_MISSING",
      "Validated path parameter context is unavailable",
    );
  }

  return value;
}