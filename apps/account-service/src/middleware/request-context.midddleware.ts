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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getRequestId(
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
    const requestId =
      getRequestId(
        request.get(
          REQUEST_ID_HEADER,
        ),
      );

    response.setHeader(
      REQUEST_ID_HEADER,
      requestId,
    );

    runWithRequestContext(
      {
        requestId,
        serviceName:
          "account-service",
      },
      next,
    );
  };