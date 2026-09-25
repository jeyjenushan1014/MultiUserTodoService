import pg from "pg";

import {
  env,
} from "./env.js";

import {
  logger,
} from "./logger.js";

export const database =
  new pg.Pool({
    connectionString:
      env.TODO_DATABASE_URL,

    application_name:
      "todo-service",

    max:
      env.DATABASE_POOL_MAX,

    connectionTimeoutMillis:
      env
        .DATABASE_CONNECTION_TIMEOUT_MS,

    idleTimeoutMillis:
      env
        .DATABASE_IDLE_TIMEOUT_MS,
  });

database.on(
  "error",
  (error) => {
    logger.error(
      {
        err: error,

        errorCode:
          "code" in error
            ? error.code
            : undefined,
      },
      "Idle TODO database client error",
    );
  },
);

export async function verifyDatabaseConnection():
Promise<void> {
  const maxRetries =
    env.DATABASE_STARTUP_RETRIES;

  const retryDelay =
    env.DATABASE_STARTUP_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const client = await database.connect();

      try {
        await client.query("SELECT 1");
        return;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.warn(
        {
          err: error,
          attempt,
        },
        "TODO database connection attempt failed",
      );

      if (attempt === maxRetries) {
        logger.error(
          {
            err: error,
            attempts: attempt + 1,
          },
          "TODO database connection failed after retries",
        );

        throw error;
      }

      const backoff = Math.min(2 ** (attempt + 1) * retryDelay, 30_000);

      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

export async function isDatabaseAvailable():
Promise<boolean> {
  try {
    await database.query(
      "SELECT 1",
    );

    return true;
  } catch (error) {
    logger.warn(
      {
        err: error,
      },
      "TODO database health check failed",
    );

    return false;
  }
}