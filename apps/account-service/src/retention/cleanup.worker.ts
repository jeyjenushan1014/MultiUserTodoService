import {
  database,
  verifyDatabaseConnection,
} from "../config/database.js";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  AccountCleanupRepository,
} from "./cleanup.repository.js";

let shutdownRequested = false;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

function requestShutdown(signal: string): void {
  shutdownRequested = true;
  logger.info({ signal }, "Account cleanup worker shutdown requested");
}

process.once("SIGTERM", () => {
  requestShutdown("SIGTERM");
});
process.once("SIGINT", () => {
  requestShutdown("SIGINT");
});

async function run(): Promise<void> {
  await verifyDatabaseConnection();

  const repository = new AccountCleanupRepository();

  logger.info("Account cleanup worker started");

  try {
    while (!shutdownRequested) {
      const cutoff = (retentionSeconds: number): Date =>
        new Date(Date.now() - retentionSeconds * 1_000);

      const result = await repository.cleanup(
        {
          session: cutoff(env.SESSION_RETENTION_SECONDS),
          token: cutoff(env.TOKEN_RETENTION_SECONDS),
          outbox: cutoff(env.OUTBOX_RETENTION_SECONDS),
          notification: cutoff(
            env.NOTIFICATION_RETENTION_SECONDS,
          ),
        },
        env.CLEANUP_BATCH_SIZE,
      );

      logger.info(result, "Account cleanup batch completed");
      await wait(env.CLEANUP_INTERVAL_MS);
    }
  } finally {
    await database.end();
    logger.info("Account cleanup worker stopped");
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, "Account cleanup worker failed");
  process.exitCode = 1;
});