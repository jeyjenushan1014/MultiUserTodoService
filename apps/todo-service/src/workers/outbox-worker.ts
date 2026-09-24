import {
  hostname,
} from "node:os";

import {
  connect,
} from "amqplib";

import type {
  ConfirmChannel,
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
  PostgresTodoOutboxRepository,
} from "../outbox/postgres.todo-outbox.repository.js";

import {
  RabbitMqTodoEventPublisher,
} from "../outbox/rabbitmq.todo-event.publisher.js";

import {
  TodoOutboxService,
} from "../outbox/todo-outbox.service.js";

import {
  TodoOutboxWorker,
} from "../outbox/todo-outbox.worker.js";

type RabbitMqConnection =
  Awaited<
    ReturnType<
      typeof connect
    >
  >;

let connection:
  RabbitMqConnection | undefined;

let channel:
  ConfirmChannel | undefined;

let worker:
  TodoOutboxWorker | undefined;

let shutdownStarted =
  false;

function createWorkerId():
  string {
  return [
    env.TODO_OUTBOX_WORKER_ID,
    hostname(),
    process.pid,
  ]
    .join(":")
    .slice(
      0,
      100,
    );
}

function requestShutdown(
  reason: string,
  exitCode = 0,
): void {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted =
    true;

  if (exitCode !== 0) {
    process.exitCode =
      exitCode;
  }

  logger.info(
    {
      reason,
    },
    "TODO outbox worker shutdown requested",
  );

  worker?.stop();
}

async function closeResource(
  resourceName: string,
  close:
    () => Promise<void>,
): Promise<void> {
  try {
    await close();
  } catch (error) {
    logger.error(
      {
        error,
        resourceName,
      },
      "TODO outbox worker resource shutdown failed",
    );

    process.exitCode =
      1;
  }
}

process.once(
  "SIGTERM",
  () => {
    requestShutdown(
      "SIGTERM",
    );
  },
);

process.once(
  "SIGINT",
  () => {
    requestShutdown(
      "SIGINT",
    );
  },
);

try {
  const workerId =
    createWorkerId();

  connection =
    await connect(
      env.RABBITMQ_URL,
    );

  connection.on(
    "error",
    (
      error:
        Error,
    ) => {
      logger.error(
        {
          error,
        },
        "TODO outbox RabbitMQ connection error",
      );
    },
  );

  connection.on(
    "close",
    () => {
      if (!shutdownStarted) {
        logger.error(
          "TODO outbox RabbitMQ connection closed unexpectedly",
        );

        requestShutdown(
          "rabbitmq-connection-closed",
          1,
        );
      }
    },
  );

  channel =
    await connection
      .createConfirmChannel();

  channel.on(
    "error",
    (
      error:
        Error,
    ) => {
      logger.error(
        {
          error,
        },
        "TODO outbox RabbitMQ channel error",
      );
    },
  );

  const publisher =
    new RabbitMqTodoEventPublisher(
      channel,
      env.TODO_EVENTS_EXCHANGE,
    );

  await publisher.initialize();

  const repository =
    new PostgresTodoOutboxRepository();

  const service =
    new TodoOutboxService(
      repository,
      publisher,
      {
        workerId,

        batchSize:
          env.TODO_OUTBOX_BATCH_SIZE,

        lockTimeoutMilliseconds:
          env
            .TODO_OUTBOX_LOCK_TIMEOUT_MS,
      },
    );

  worker =
    new TodoOutboxWorker(
      service,
      env
        .TODO_OUTBOX_POLL_INTERVAL_MS,
      {
        batchProcessed:
          (result) => {
            if (
              result.claimed > 0
            ) {
              logger.info(
                {
                  workerId,
                  ...result,
                },
                "TODO outbox batch processed",
              );
            }
          },

        processingFailed:
          (error) => {
            logger.error(
              {
                error,
                workerId,
              },
              "TODO outbox batch processing failed",
            );
          },
      },
    );

  logger.info(
    {
      workerId,

      exchange:
        env.TODO_EVENTS_EXCHANGE,

      batchSize:
        env.TODO_OUTBOX_BATCH_SIZE,

      pollIntervalMilliseconds:
        env
          .TODO_OUTBOX_POLL_INTERVAL_MS,
    },
    "TODO outbox worker started",
  );


    await worker.run();
  
} catch (error) {
  logger.error(
    {
      error,
    },
    "TODO outbox worker failed to start",
  );

  process.exitCode =
    1;
} finally {
  shutdownStarted =
    true;

  const channelToClose =
    channel;

  if (
    channelToClose !==
    undefined
  ) {
    await closeResource(
      "rabbitmq-channel",
      () =>
        channelToClose
          .close(),
    );
  }

  const connectionToClose =
    connection;

  if (
    connectionToClose !==
    undefined
  ) {
    await closeResource(
      "rabbitmq-connection",
      () =>
        connectionToClose
          .close(),
    );
  }

  await closeResource(
    "postgresql-pool",
    () =>
      database.end(),
  );

  logger.info(
    "TODO outbox worker stopped",
  );
}