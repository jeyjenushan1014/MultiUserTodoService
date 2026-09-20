import {
  randomUUID,
} from "node:crypto";

import type {
  RequestHandler,
} from "express";

import {
  runWithRequestContext,
} from "@todo/common";

export const requestContextMiddleware:
RequestHandler = (
  _request,
  response,
  next,
): void => {

  const requestId = randomUUID();

  response.setHeader(
    "X-Request-Id",
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