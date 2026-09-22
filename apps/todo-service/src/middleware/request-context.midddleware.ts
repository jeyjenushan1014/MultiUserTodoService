import {
  randomUUID,
} from "node:crypto";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  runWithRequestContext,
} from "@todo/common";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function resolveRequestId(
  request: Request,
): string {
  const requestIdHeader =
    request.header(
      "x-request-id",
    );

  if (
    requestIdHeader !== undefined &&
    UUID_PATTERN.test(
      requestIdHeader,
    )
  ) {
    return requestIdHeader;
  }

  return randomUUID();
}

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId =
    resolveRequestId(request);

  response.setHeader(
    "x-request-id",
    requestId,
  );

  runWithRequestContext(
    {
      requestId,
      serviceName:
        "todo-service",
    },
    () => {
      next();
    },
  );
}