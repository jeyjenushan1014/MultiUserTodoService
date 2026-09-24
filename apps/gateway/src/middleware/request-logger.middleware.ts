import type {
  RequestHandler,
} from "express";

import {
  getRequestId,
} from "@todo/common";

import {
  logger,
} from "../config/logger.js";

export const requestLoggerMiddleware:
  RequestHandler = (
    request,
    response,
    next,
  ): void => {
    const startedAt =
      process.hrtime.bigint();

    logger.info(
      {
        method: request.method,
        path: request.path,
        requestId: getRequestId(),
      },
      "HTTP request started",
    );

    response.once(
      "finish",
      (): void => {
        const finishedAt =
          process.hrtime.bigint();

        const durationMilliseconds =
          Number(
            finishedAt - startedAt,
          ) / 1_000_000;

        logger.info(
          {
            method: request.method,
            path: request.path,
            statusCode:
              response.statusCode,
            durationMilliseconds,
            requestId: getRequestId(),
          },
          "HTTP request completed",
        );
      },
    );

    next();
  };