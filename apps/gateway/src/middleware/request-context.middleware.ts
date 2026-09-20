/*
It is mainly used to generate system generated id instead of send the client id
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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getValidRequestId(
  requestIdHeader: string | undefined,
): string {
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

export const requestContextMiddleware:
  RequestHandler = (
    request,
    response,
    next,
  ): void => {
    const headerValue =
      request.get(
        REQUEST_ID_HEADER,
      );

    const requestId =
      getValidRequestId(
        headerValue,
      );

    response.setHeader(
      REQUEST_ID_HEADER,
      requestId,
    );

    runWithRequestContext(
      {
        requestId,
        serviceName: "gateway",
      },
      next,
    );
  };