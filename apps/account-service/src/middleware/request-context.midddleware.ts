/*
The Gateway creates the request ID for public traffic;
Account Service propagates it for signed internal requests.
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
    request,
    response,
    next,
  ): void => {
    const suppliedRequestId =
      request.get(
        REQUEST_ID_HEADER,
      );

    const requestId =
      suppliedRequestId ??
      randomUUID();

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