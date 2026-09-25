import {
  connect,
} from "amqplib";

import type {
  ChannelModel,
} from "amqplib";

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
  PostgresTodoHistoryRepository,
} from "./todo-history.repository.js";

import {
  TodoHistoryConsumer,
} from "./todo-history.consumer.js";

let shutdownStarted =
  false;

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

let activeConnection:
  ChannelModel | undefined;

async function run(): Promise<void> {
  while (!shutdownStarted) {
    try {
      await verifyDatabaseConnection();

      const connection =
        await connect(
          env.RABBITMQ_URL,
        );

      const channel =
        await connection.createChannel();

      activeConnection =
        connection;

      connection.once(
        "close",
        () => {
          logger.warn(
            "TODO history RabbitMQ connection closed; reconnecting",
          );
        },
      );

      connection.on(
        "error",
        (error) => {
          logger.warn(
            {
              err: error,
            },
            "TODO history RabbitMQ connection error",
          );
        },
      );

      const repository =
        new PostgresTodoHistoryRepository();

      const consumer =
        new TodoHistoryConsumer(
          channel,
          repository,
        );

      await consumer.initialize();
      await consumer.start();

      logger.info(
        "TODO history consumer started",
      );

      await new Promise<void>(
        (resolve) => {
          connection.once(
            "close",
            resolve,
          );
        },
      );

      activeConnection =
        undefined;
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        "TODO history consumer cycle failed; retrying",
      );

      await wait(
        1000,
      );
    }
  }
}

async function shutdown(
  signal: string,
): Promise<void> {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;

  logger.info(
    {
      signal,
    },
    "TODO history consumer shutdown started",
  );

  if (activeConnection !== undefined) {
    await activeConnection.close();
  }

  await database.end();

  logger.info(
    "TODO history consumer shutdown completed",
  );
}

process.once(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM",
    );
  },
);

process.once(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT",
    );
  },
);

void run().catch(
  (error: unknown) => {
    logger.fatal(
      {
        err: error,
      },
      "TODO history consumer stopped unexpectedly",
    );

    process.exitCode = 1;
  },
);