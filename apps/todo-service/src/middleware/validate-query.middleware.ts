import type {
  RequestHandler,
  Response,
} from "express";

import type {
  ZodType,
} from "zod";

import {
  AppError,
} from "@todo/common";

import type {
  ErrorDetail,
} from "@todo/contracts";

const VALIDATED_QUERY_KEY =
  "validatedQuery";

export function validateQuery<T>(
  schema: ZodType<T>,
): RequestHandler {
  return (
    request,
    response,
    next,
  ): void => {
    const result =
      schema.safeParse(
        request.query,
      );

    if (!result.success) {
      const details:
        readonly ErrorDetail[] =
        result.error.issues.map(
          (issue) => ({
            field:
              issue.path.join(".") ||
              "query",

            message:
              issue.message,
          }),
        );

      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Request query parameters are invalid",
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

    locals[VALIDATED_QUERY_KEY] =
      result.data;

    next();
  };
}

export function getValidatedQuery(
  response: Response,
): unknown {
  const locals =
    response.locals as Record<
      string,
      unknown
    >;

  const value =
    locals[VALIDATED_QUERY_KEY];

  if (value === undefined) {
    throw new AppError(
      500,
      "VALIDATED_QUERY_MISSING",
      "Validated query context is unavailable",
    );
  }

  /*
   * The value was parsed by the Zod schema before
   * being stored in response.locals.
   */
  return value;
}