/*
The Gateway is the only public entry point.

A public client is not allowed to choose the
trusted request ID. The Gateway always creates
a new system-generated UUID.
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

export const requestContextMiddleware:
  RequestHandler = (
    _request,
    response,
    next,
  ): void => {
    const requestId =
      randomUUID();

    response.setHeader(
      REQUEST_ID_HEADER,
      requestId,
    );

    runWithRequestContext(
      {
        requestId,

        serviceName:
          "gateway",
      },
      next,
    );
  };