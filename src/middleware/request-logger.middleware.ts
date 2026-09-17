//This file mainyly contains the implementation of a middleware function that logs HTTP requests and responses using the pino-http library.
//It generates a unique request ID for each incoming request, which is included in the logs and response headers. 
//The middleware also redacts sensitive information from the logs, such as authorization headers and passwords, to enhance security.

import { randomUUID } from "node:crypto";
import pinoHttp from "pino-http";
import { logger } from "../config/logger.js";

export const requestLogger = pinoHttp({
  logger,

  genReqId: (request, response) => {
    const existingRequestId =
      request.headers["x-request-id"];

    const requestId =
      typeof existingRequestId === "string"
        ? existingRequestId
        : randomUUID();

    response.setHeader(
      "x-request-id",
      requestId,
    );

    return requestId;
  },

  customLogLevel: (
    _request,
    response,
    error,
  ) => {
    if (
      error !== undefined ||
      response.statusCode >= 500
    ) {
      return "error";
    }

    if (response.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },

  redact: {
    paths: [
      "req.headers.authorization",
      "req.body.password",
      "res.headers.set-cookie",
    ],
    censor: "[REDACTED]",
  },
});