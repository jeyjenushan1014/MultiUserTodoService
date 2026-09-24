import {
  connect,
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

const connection =
  await connect(
    env.RABBITMQ_URL,
  );

const channel =
  await connection.createChannel();

await verifyDatabaseConnection();

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

let shutdownStarted =
  false;

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

  await channel.close();
  await connection.close();
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