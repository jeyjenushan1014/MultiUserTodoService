import type {
  Server,
} from "node:http";

import {
  app,
} from "./app.js";

import {
  cache,
  connectCache,
} from "./config/cache.js";

import {
  database,
  verifyDatabaseConnection,
} from "./config/database.js";

import {
  env,
} from "./config/env.js";

import {
  logger,
} from "./config/logger.js";

let shutdownStarted = false;

async function closeHttpServer(
  server: Server,
): Promise<void> {
  await new Promise<void>(
    (resolve, reject) => {
      server.close(
        (error) => {
          if (
            error === undefined
          ) {
            resolve();

            return;
          }

          reject(error);
        },
      );
    },
  );
}

async function startServer():
Promise<void> {
  await verifyDatabaseConnection();

  try {
    await connectCache();
  } catch (error) {
    logger.warn(
      {
        err: error,
      },
      "Redis unavailable; TODO Service is starting in degraded mode",
    );
  }

  const server =
    app.listen(
      env.TODO_SERVICE_PORT,
      () => {
        logger.info(
          {
            port:
              env.TODO_SERVICE_PORT,

            environment:
              env.NODE_ENV,
          },
          "TODO Service started",
        );
      },
    );

  const shutdown = async (
    signal: string,
  ): Promise<void> => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;

    logger.info(
      {
        signal,
      },
      "TODO Service graceful shutdown started",
    );

    const forceShutdownTimer =
      setTimeout(
        () => {
          logger.fatal(
            {
              signal,
            },
            "TODO Service graceful shutdown timed out",
          );

          process.exitCode = 1;
        },
        env.SHUTDOWN_TIMEOUT_MS,
      );

    forceShutdownTimer.unref();

    try {
      await closeHttpServer(
        server,
      );

      await Promise.allSettled([
        database.end(),

        cache.isOpen
          ? cache.quit()
          : Promise.resolve(),
      ]);

      logger.info(
        "TODO Service graceful shutdown completed",
      );
    } catch (error) {
      logger.error(
        {
          err: error,
          signal,
        },
        "TODO Service graceful shutdown failed",
      );

      process.exitCode = 1;
    } finally {
      clearTimeout(
        forceShutdownTimer,
      );
    }
  };

  process.on(
    "SIGTERM",
    () => {
      void shutdown(
        "SIGTERM",
      );
    },
  );

  process.on(
    "SIGINT",
    () => {
      void shutdown(
        "SIGINT",
      );
    },
  );
}

void startServer().catch(
  (error: unknown) => {
    logger.fatal(
      {
        err: error,
      },
      "TODO Service startup failed because a required dependency or configuration is unavailable",
    );

    process.exitCode = 1;
  },
);