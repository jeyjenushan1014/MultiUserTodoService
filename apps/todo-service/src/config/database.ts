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
  const client =
    await database.connect();

  try {
    await client.query(
      "SELECT 1",
    );
  } finally {
    client.release();
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