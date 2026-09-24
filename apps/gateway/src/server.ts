import type {
  Server,
} from "node:http";

import {
  app,
} from "./app.js";

import {
  env,
} from "./config/env.js";

import {
  logger,
} from "./config/logger.js";

import {
  connectRedis,
  disconnectRedis,
} from "./config/redis.js";

let shutdownStarted =
  false;

let redisAvailable =
  false;

/*
Redis is optional for Gateway availability.

If the initial connection fails, the Gateway starts
in degraded mode and rate limiting fails open.
*/
try {
  await connectRedis();

  redisAvailable =
    true;
} catch (error) {
  logger.warn(
    {
      error,

      dependency:
        "redis",

      degradedFeature:
        "rate-limiting",
    },
    "Redis unavailable; Gateway starting with rate limiting disabled",
  );
}

const server:
  Server =
  app.listen(
    env.PORT,
    (): void => {
      logger.info(
        {
          port:
            env.PORT,

          environment:
            env.NODE_ENV,

          redisAvailable,
        },
        "API Gateway started",
      );
    },
  );

async function closeDependencies():
  Promise<boolean> {
  const results =
    await Promise.allSettled([
      disconnectRedis(),
    ]);

  let shutdownSucceeded =
    true;

  for (
    const result of results
  ) {
    if (
      result.status ===
      "rejected"
    ) {
      shutdownSucceeded =
        false;

      const error: unknown =
        result.reason;

      logger.error(
        {
          error,

          dependency:
            "redis",
        },
        "Gateway dependency shutdown failed",
      );
    }
  }

  return shutdownSucceeded;
}

async function completeShutdown(
  httpServerError:
    Error | undefined,
  forcedShutdownTimer:
    NodeJS.Timeout,
): Promise<void> {
  let shutdownSucceeded =
    httpServerError ===
    undefined;

  if (
    httpServerError !==
    undefined
  ) {
    logger.error(
      {
        error:
          httpServerError,

        component:
          "http-server",
      },
      "Gateway HTTP server shutdown failed",
    );
  }

  const dependencyShutdownSucceeded =
    await closeDependencies();

  if (
    !dependencyShutdownSucceeded
  ) {
    shutdownSucceeded =
      false;
  }

  clearTimeout(
    forcedShutdownTimer,
  );

  if (!shutdownSucceeded) {
    logger.error(
      "Gateway shutdown completed with errors",
    );

    process.exitCode =
      1;

    return;
  }

  logger.info(
    "Gateway shutdown completed",
  );

  process.exitCode =
    0;
}

function shutdown(
  signal:
    string,
): void {
  if (shutdownStarted) {
    logger.warn(
      {
        signal,
      },
      "Gateway shutdown already in progress",
    );

    return;
  }

  shutdownStarted =
    true;

  logger.info(
    {
      signal,
    },
    "Gateway shutdown started",
  );

  const forcedShutdownTimer =
    setTimeout(
      (): void => {
        logger.error(
          {
            timeoutMilliseconds:
              10_000,
          },
          "Gateway forced shutdown after timeout",
        );

        process.exit(1);
      },
      10_000,
    );

  forcedShutdownTimer.unref();

  server.close(
    (
      error?:
        Error,
    ): void => {
      void completeShutdown(
        error,
        forcedShutdownTimer,
      );
    },
  );
}

process.once(
  "SIGTERM",
  (): void => {
    shutdown(
      "SIGTERM",
    );
  },
);

process.once(
  "SIGINT",
  (): void => {
    shutdown(
      "SIGINT",
    );
  },
);