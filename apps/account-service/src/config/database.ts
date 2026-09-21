import pg from "pg";

import {
  DatabaseError,
} from "pg";

import {
  env,
} from "./env.js";

import {
  logger,
} from "./logger.js";

export const database =
  new pg.Pool({
    connectionString:
      env.ACCOUNT_DATABASE_URL,

    max:
      env.DATABASE_MAX_CONNECTIONS,

    connectionTimeoutMillis:
      env.DATABASE_CONNECTION_TIMEOUT_MS,

    idleTimeoutMillis:
      env.DATABASE_IDLE_TIMEOUT_MS,

    query_timeout:
      env.DATABASE_QUERY_TIMEOUT_MS,

    application_name:
      "todo-account-service",
  });

database.on(
  "error",
  (error:Error): void => {
    logger.error(
      {
        error,
        errorCode:
           error instanceof DatabaseError
           ? error.code
           : undefined
        ,
      },
      "Idle PostgreSQL client error; pool remains available for recovery",
    );
  },
);

export async function checkDatabaseHealth():
  Promise<boolean> {
  try {
    await database.query(
      "SELECT 1",
    );

    return true;
  } catch (error) {
    logger.warn(
      {
        error,
      },
      "PostgreSQL health check failed",
    );

    return false;
  }
}

export async function closeDatabase():
  Promise<void> {
  await database.end();
}