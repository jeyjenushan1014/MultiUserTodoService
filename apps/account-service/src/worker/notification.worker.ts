import {
  connect,
} from "amqplib";

import {
  database,
} from "../config/database.js";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  SmtpNotificationMailer,
} from "../notifications/notification.mailer.js";

import {
  TodoNotificationConsumer,
} from "../notifications/notification.consumer.js";

const connection =
  await connect(
    env.RABBITMQ_URL,
  );

const channel =
  await connection.createChannel();

const consumer =
  new TodoNotificationConsumer(
    channel,
    new SmtpNotificationMailer(),
  );

await consumer.initialize();
await consumer.start();

logger.info(
  "Account notification consumer started",
);

let shuttingDown = false;

async function shutdown(
  signal: string,
): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    {
      signal,
    },
    "Notification consumer shutdown started",
  );

  await channel.close();
  await connection.close();
  await database.end();

  logger.info(
    "Notification consumer shutdown completed",
  );
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