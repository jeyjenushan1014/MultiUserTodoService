import {
  performance,
} from "node:perf_hooks";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  logger,
} from "../config/logger.js";

export function requestLoggerMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt =
    performance.now();

  logger.info(
    {
      method:
        request.method,

      path:
        request.originalUrl,
    },
    "HTTP request started",
  );

  response.on(
    "finish",
    () => {
      const durationMilliseconds =
        performance.now() -
        startedAt;

      logger.info(
        {
          method:
            request.method,

          path:
            request.originalUrl,

          statusCode:
            response.statusCode,

          durationMilliseconds:
            Number(
              durationMilliseconds
                .toFixed(3),
            ),
        },
        "HTTP request completed",
      );
    },
  );

  next();
}
