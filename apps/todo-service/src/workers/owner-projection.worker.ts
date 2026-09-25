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

let activeConsumer:
  AccountEventConsumer | undefined;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function startWorkerLoop(): Promise<void> {
  while (!shutdownStarted) {
    try {
      await verifyDatabaseConnection();

      const repository = new PostgresOwnerProjectionRepository();

      const service = new OwnerProjectionService(repository);

      const consumer =
        new AccountEventConsumer(service);

      activeConsumer = consumer;

      await consumer.start();

      await consumer.waitForConnectionClose();

      activeConsumer = undefined;

      // shutdownStarted can flip while awaiting above, via the SIGTERM/SIGINT handlers
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!shutdownStarted) {
        logger.warn(
          "TODO owner projection RabbitMQ connection closed; reconnecting",
        );
      }
    } catch (error) {
      logger.error({ error }, "TODO owner projection startup failed; retrying");
      await wait(2000);
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;

  logger.info(
    { signal },
    "TODO owner projection shutdown started",
  );

  try {
    if (activeConsumer !== undefined) {
      await activeConsumer.close();
    }

    await database.end();

    logger.info("TODO owner projection shutdown completed");
  } catch (error) {
    logger.error(
      {
        err: error,
        signal,
      },
      "TODO owner projection shutdown failed",
    );
    process.exitCode = 1;
  }
}

process.once(
  "SIGTERM",
  () => {
    void shutdown("SIGTERM");
  },
);

process.once(
  "SIGINT",
  () => {
    void shutdown("SIGINT");
  },
);

void startWorkerLoop().catch((error: unknown) => {
  logger.fatal({ err: error }, "TODO owner projection fatal startup failure");
  process.exitCode = 1;
});