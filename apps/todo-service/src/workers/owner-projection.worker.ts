/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import {
  database,
  verifyDatabaseConnection,
} from "../config/database.js";

import {
  logger,
} from "../config/logger.js";

import {
  AccountEventConsumer,
} from "../messaging/account-event.consumer.js";

import {
  PostgresOwnerProjectionRepository,
} from "../messaging/owner-projection.repository.js";

import {
  OwnerProjectionService,
} from "../messaging/owner-projection.service.js";

let shutdownStarted = false;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function startWorkerLoop(): Promise<void> {
  while (!shutdownStarted) {
    try {
      await verifyDatabaseConnection();

      const repository = new PostgresOwnerProjectionRepository();

      const service = new OwnerProjectionService(repository);

      const consumer = new AccountEventConsumer(service);

      await consumer.start();

      const shutdown = async (signal: string): Promise<void> => {
        shutdownStarted = true;

        logger.info({ signal }, "TODO owner projection shutdown started");

        try {
          await consumer.close();
          await database.end();

          logger.info("TODO owner projection shutdown completed");
        } catch (error) {
          logger.error({ err: error, signal }, "TODO owner projection shutdown failed");
          process.exitCode = 1;
        }
      };

      process.on("SIGTERM", () => void shutdown("SIGTERM"));
      process.on("SIGINT", () => void shutdown("SIGINT"));

      // consumer started successfully — wait until shutdown is requested
      while (!shutdownStarted) {
        await wait(1000);
      }

      break;
    } catch (error) {
      logger.error({ error }, "TODO owner projection startup failed; retrying");
      await wait(2000);
    }
  }
}

void startWorkerLoop().catch((error: unknown) => {
  logger.fatal({ err: error }, "TODO owner projection fatal startup failure");
  process.exitCode = 1;
});