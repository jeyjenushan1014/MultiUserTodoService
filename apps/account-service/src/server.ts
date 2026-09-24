import type {
  Server,
} from "node:http";

import {
  app,
} from "./app.js";

import {
  closeDatabase,
} from "./config/database.js";

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
        "Account Service started",
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
    "Account Service shutdown started",
  );

  const forcedShutdownTimer =
    setTimeout(
      (): void => {
        logger.error(
          "Account Service forced shutdown after timeout",
        );

        process.exit(1);
      },
      10_000,
    );

  forcedShutdownTimer.unref();

  server.close(
    (serverError?: Error): void => {
      if (
        serverError !== undefined
      ) {
        clearTimeout(
          forcedShutdownTimer,
        );

        logger.error(
          {
            error:
              serverError,
          },
          "HTTP server shutdown failed",
        );

        process.exitCode = 1;
        return;
      }

      void closeDatabase()
        .then((): void => {
          clearTimeout(
            forcedShutdownTimer,
          );

          logger.info(
            "Account Service shutdown completed",
          );

          process.exitCode = 0;
        })
        .catch(
          (
            databaseError:
              unknown,
          ): void => {
            clearTimeout(
              forcedShutdownTimer,
            );

            logger.error(
              {
                error:
                  databaseError,
              },
              "Database shutdown failed",
            );

            process.exitCode = 1;
          },
        );
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