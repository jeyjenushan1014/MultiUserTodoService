import "dotenv/config";

import {
  z,
} from "zod";

const environmentSchema =
  z.object({
    NODE_ENV:
      z
        .enum([
          "development",
          "test",
          "production",
        ])
        .default("development"),

    TODO_SERVICE_PORT:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(65_535)
        .default(3002),

    TODO_DATABASE_URL:
      z
        .string()
        .min(
          1,
          "TODO_DATABASE_URL is required",
        ),

    REDIS_URL:
      z
        .string()
        .min(
          1,
          "REDIS_URL is required",
        ),

    RABBITMQ_URL:
      z
        .string()
        .min(
          1,
          "RABBITMQ_URL is required",
        ),

    RABBITMQ_EXCHANGE:
      z
        .string()
        .min(1)
        .default(
          "todo.events",
        ),

    RABBITMQ_RETRY_EXCHANGE:
      z
        .string()
        .min(1)
        .default(
          "todo.events.retry",
        ),
      
    INTERNAL_IDENTITY_MAX_AGE_SECONDS:
  z.coerce
    .number()
    .int()
    .min(5)
    .max(300)
    .default(30),


REDIS_CONNECT_TIMEOUT_MS: z.coerce
  .number()
  .int()
  .positive()
  .default(2000),

CACHE_TTL_SECONDS: z.coerce
  .number()
  .int()
  .positive()
  .max(3600)
  .default(60),

  TODO_EVENTS_EXCHANGE:
  z
    .string()
    .trim()
    .min(1)
    .default(
      "todo.events",
    ),

TODO_OUTBOX_WORKER_ID:
  z
    .string()
    .trim()
    .min(1)
    .max(50)
    .default(
      "todo-outbox-worker",
    ),

TODO_OUTBOX_BATCH_SIZE:
  z
    .coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25),

TODO_OUTBOX_POLL_INTERVAL_MS:
  z
    .coerce
    .number()
    .int()
    .min(50)
    .max(60_000)
    .default(1_000),

TODO_OUTBOX_LOCK_TIMEOUT_MS:
  z
    .coerce
    .number()
    .int()
    .min(1_000)
    .max(600_000)
    .default(30_000),
TODO_HISTORY_QUEUE:
  z
    .string()
    .min(1)
    .default("todo.history"),

TODO_HISTORY_DLQ:
  z
    .string()
    .min(1)
    .default("todo.history.dlq"),
    

    RABBITMQ_DEAD_LETTER_EXCHANGE:
      z
        .string()
        .min(1)
        .default(
          "todo.events.dlx",
        ),

    TODO_OWNER_QUEUE:
      z
        .string()
        .min(1)
        .default(
          "todo.owner-projection",
        ),

    TODO_OWNER_RETRY_QUEUE:
      z
        .string()
        .min(1)
        .default(
          "todo.owner-projection.retry",
        ),

    TODO_OWNER_DEAD_LETTER_QUEUE:
      z
        .string()
        .min(1)
        .default(
          "todo.owner-projection.dlq",
        ),

    TODO_OWNER_CONSUMER_PREFETCH:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10),

    TODO_OWNER_RETRY_DELAY_MS:
      z.coerce
        .number()
        .int()
        .min(1000)
        .max(300_000)
        .default(5000),

    TODO_OWNER_MAX_RETRIES:
      z.coerce
        .number()
        .int()
        .min(0)
        .max(20)
        .default(5),

    INTERNAL_SERVICE_SECRET:
      z
        .string()
        .min(
          32,
          "INTERNAL_SERVICE_SECRET must contain at least 32 characters",
        ),

    LOG_LEVEL:
      z
        .enum([
          "fatal",
          "error",
          "warn",
          "info",
          "debug",
          "trace",
          "silent",
        ])
        .default("info"),

    REQUEST_BODY_LIMIT:
      z
        .string()
        .min(1)
        .default("100kb"),

    DATABASE_POOL_MAX:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(10),

    DATABASE_CONNECTION_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(100)
        .max(60_000)
        .default(5000),

    DATABASE_IDLE_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(1000)
        .max(300_000)
        .default(30_000),

    DATABASE_STARTUP_RETRIES:
      z.coerce
        .number()
        .int()
        .min(0)
        .max(100)
        .default(10),

    DATABASE_STARTUP_RETRY_DELAY_MS:
      z.coerce
        .number()
        .int()
        .min(100)
        .max(60_000)
        .default(2000),

    SHUTDOWN_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(1000)
        .max(60_000)
        .default(10_000),
  });

export const env =
  environmentSchema.parse(
    process.env,
  );