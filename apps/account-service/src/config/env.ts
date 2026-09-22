import {
  z,
} from "zod";

const environmentSchema =
  z.object({
    NODE_ENV: z
      .enum([
        "development",
        "test",
        "production",
      ])
      .default("development"),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .default(3001),

    RABBITMQ_URL:
  z
    .string()
    .min(1),

RABBITMQ_EXCHANGE:
  z
    .string()
    .min(1)
    .default("todo.events"),

RABBITMQ_NOTIFICATION_QUEUE:
  z
    .string()
    .min(1)
    .default("todo.notifications"),

RABBITMQ_DEAD_LETTER_EXCHANGE:
  z
    .string()
    .min(1)
    .default("todo.events.dlx"),

RABBITMQ_NOTIFICATION_DLQ:
  z
    .string()
    .min(1)
    .default("todo.notifications.dlq"),

OUTBOX_BATCH_SIZE:
  z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

OUTBOX_POLL_INTERVAL_MS:
  z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1000),

OUTBOX_LOCK_TIMEOUT_SECONDS:
  z.coerce
    .number()
    .int()
    .min(10)
    .max(3600)
    .default(60),

OUTBOX_MAX_RETRY_DELAY_SECONDS:
  z.coerce
    .number()
    .int()
    .min(10)
    .max(86_400)
    .default(300),
    
    PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce
        .number()
        .int()
        .positive()
        .max(60)
        .default(15),

    ACCOUNT_DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value): boolean => {
          try {
            const url =
              new URL(value);

            return (
              url.protocol ===
                "postgres:" ||
              url.protocol ===
                "postgresql:"
            );
          } catch {
            return false;
          }
        },
        {
          message:
            "DATABASE_URL must be a valid PostgreSQL connection URL",
        },
      ),

    DATABASE_MAX_CONNECTIONS:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10),

    DATABASE_CONNECTION_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(100)
        .max(30_000)
        .default(5_000),

    DATABASE_IDLE_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(1_000)
        .max(300_000)
        .default(30_000),

    DATABASE_QUERY_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(100)
        .max(30_000)
        .default(2_000),

    INTERNAL_SERVICE_SECRET:
       z.string()
        .min(32),

    PASSWORD_HASH_ROUNDS: 
       z.coerce
          .number()
          .int()
          .min(10)
          .max(14)
          .default(12),
    
    JWT_SECRET: z
        .string()
        .min(32),

    JWT_ISSUER: z
        .string()
        .min(1)
        .default(
           "todo-account-service",
        ),

    JWT_AUDIENCE: z
      .string()
      .min(1)
      .default(
         "todo-platform",
      ),

  ACCESS_TOKEN_TTL_SECONDS:
       z.coerce
        .number()
        .int()
        .positive()
        .max(3600)
        .default(900),

  REFRESH_TOKEN_TTL_SECONDS:
       z.coerce
          .number()
         .int()
         .positive()
        .default(604800),
    LOG_LEVEL: z
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
  });

export const env =
  environmentSchema.parse(
    process.env,
  );