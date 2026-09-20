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

let shutdownStarted =
  false;

const server: Server =
  app.listen(
    env.PORT,
    (): void => {
      logger.info(
        {
          port: env.PORT,
          environment:
            env.NODE_ENV,
        },
        "API Gateway started",
      );
    },
  );

function shutdown(
  signal: string,
): void {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;

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
          "Gateway forced shutdown after timeout",
        );

        process.exit(1);
      },
      10_000,
    );

  forcedShutdownTimer.unref();

  server.close(
    (error?: Error): void => {
      clearTimeout(
        forcedShutdownTimer,
      );

      if (error !== undefined) {
        logger.error(
          {
            error,
          },
          "Gateway shutdown failed",
        );

        process.exitCode = 1;
        return;
      }

      logger.info(
        "Gateway shutdown completed",
      );

      process.exitCode = 0;
    },
  );
}

process.once(
  "SIGTERM",
  (): void => {
    shutdown("SIGTERM");
  },
);

process.once(
  "SIGINT",
  (): void => {
    shutdown("SIGINT");
  },
);