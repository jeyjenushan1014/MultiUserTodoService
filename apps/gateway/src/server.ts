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

async function startServer():
Promise<void> {
  
  try {
    await connectRedis();
  } catch (error) {
    logger.warn(
      {
        error,
      },
      "Redis unavailable during startup; Gateway starts in degraded mode",
    );
  }

  const server = app.listen(
    env.PORT,
    "0.0.0.0",
    (): void => {
      logger.info(
        {
          port: env.PORT,
          environment: env.NODE_ENV,
        },
        "Gateway started",
      );
    },
  );

  let shuttingDown = false;

  const shutdown = (
    signal: string,
  ): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    logger.info(
      {
        signal,
      },
      "Gateway graceful shutdown started",
    );

    server.close(
      (): void => {
        void disconnectRedis()
          .catch(
            (error: unknown): void => {
              logger.warn(
                {
                  error,
                },
                "Redis shutdown failed",
              );
            },
          )
          .finally(
            (): void => {
              logger.info(
                "Gateway graceful shutdown completed",
              );

              process.exit(0);
            },
          );
      },
    );
  };

  process.on(
    "SIGTERM",
    (): void => {
      shutdown("SIGTERM");
    },
  );

  process.on(
    "SIGINT",
    (): void => {
      shutdown("SIGINT");
    },
  );
}

void startServer();