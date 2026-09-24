import {
  hostname,
} from "node:os";

import {
  randomUUID,
} from "node:crypto";

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
  OutboxService,
} from "../outbox/outbox.service.js";

import {
  PostgresOutboxRepository,
} from "../outbox/postgres-outbox.repository.js";

import {
  RabbitMqEventPublisher,
} from "../outbox/rabbitmq-event.publisher.js";

function wait(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) => {
      const timer =
        setTimeout(
          resolve,
          milliseconds,
        );

      timer.unref();
    },
  );
}

const workerId =
  `${hostname()}:${process.pid}:${randomUUID()}`;

let shutdownRequested = false;

async function run(): Promise<void> {
  await verifyDatabaseConnection();

  const repository =
    new PostgresOutboxRepository();

  const publisher =
    new RabbitMqEventPublisher();

  const service =
    new OutboxService(
      repository,
      publisher,
      workerId,
    );

  const shutdown = (
    signal: string,
  ): void => {
    if (shutdownRequested) {
      return;
    }

    shutdownRequested = true;

    logger.info(
      {
        signal,
        workerId,
      },
      "Outbox publisher shutdown requested",
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

  logger.info(
    {
      workerId,
    },
    "Outbox publisher started",
  );

  try {
    while (!shutdownRequested) {
      try {
        if (!publisher.ready) {
          await publisher.connect();
        }

        const result =
          await service.processBatch();

        if (result.claimed === 0) {
          await wait(
            env.OUTBOX_POLL_INTERVAL_MS,
          );
        }
      } catch (error) {
        logger.error(
          {
            err: error,
            workerId,
          },
          "Outbox publisher cycle failed",
        );

        await wait(
          env.OUTBOX_POLL_INTERVAL_MS,
        );
      }
    }
  } finally {
    await Promise.allSettled([
      service.releaseLocks(),
      publisher.close(),
    ]);

    await database.end();

    logger.info(
      {
        workerId,
      },
      "Outbox publisher stopped",
    );
  }
}

void run().catch(
  (error: unknown) => {
    logger.fatal(
      {
        err: error,
        workerId,
      },
      "Outbox publisher startup failed",
    );

    process.exitCode = 1;
  },
);