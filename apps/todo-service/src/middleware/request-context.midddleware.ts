/*
The TODO Service preserves a valid request ID
forwarded by the trusted Gateway.

It generates a local request ID when the header
is missing or invalid.
*/

import {
  randomUUID,
} from "node:crypto";

import type {
  RequestHandler,
} from "express";

import {
  REQUEST_ID_HEADER,
  runWithRequestContext,
} from "@todo/common";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function resolveRequestId(
  suppliedRequestId:
    string | undefined,
): string {
  if (
    suppliedRequestId !== undefined &&
    UUID_PATTERN.test(
      suppliedRequestId,
    )
  ) {
    return suppliedRequestId;
  }

  return randomUUID();
}

export const requestContextMiddleware:
  RequestHandler = (
    request,
    response,
    next,
  ): void => {
    const suppliedRequestId =
      request.get(
        REQUEST_ID_HEADER,
      );

    const requestId =
      resolveRequestId(
        suppliedRequestId,
      );

    response.setHeader(
      REQUEST_ID_HEADER,
      requestId,
    );

    runWithRequestContext(
      {
        requestId,

        serviceName:
          "todo-service",
      },
      next,
    );
  };