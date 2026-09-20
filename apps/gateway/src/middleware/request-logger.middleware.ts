import type {
  RequestHandler,
} from "express";

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
    performance.now();

  response.once(
    "finish",
    (): void => {
      const durationMilliseconds =
        performance.now() - startedAt;

      logger.info(
        {
          method: request.method,
          path: request.path,
          statusCode:
            response.statusCode,
          durationMilliseconds:
            Math.round(
              durationMilliseconds * 100,
            ) / 100,
        },
        "Request completed",
      );
    },
  );

  next();
};