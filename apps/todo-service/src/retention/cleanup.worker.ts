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
  TodoCleanupRepository,
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
  logger.info({ signal }, "TODO cleanup worker shutdown requested");
}

process.once("SIGTERM", () => {
  requestShutdown("SIGTERM");
});
process.once("SIGINT", () => {
  requestShutdown("SIGINT");
});

async function run(): Promise<void> {
  await verifyDatabaseConnection();

  const repository = new TodoCleanupRepository();

  logger.info("TODO cleanup worker started");

  try {
    while (!shutdownRequested) {
      const cutoff = (retentionSeconds: number): Date =>
        new Date(Date.now() - retentionSeconds * 1_000);

      const result = await repository.cleanup(
        {
          event: cutoff(env.EVENT_RETENTION_SECONDS),
          outbox: cutoff(env.OUTBOX_RETENTION_SECONDS),
        },
        env.CLEANUP_BATCH_SIZE,
      );

      logger.info(result, "TODO cleanup batch completed");
      await wait(env.CLEANUP_INTERVAL_MS);
    }
  } finally {
    await database.end();
    logger.info("TODO cleanup worker stopped");
  }
}

void run().catch((error: unknown) => {
  logger.fatal({ err: error }, "TODO cleanup worker failed");
  process.exitCode = 1;
});