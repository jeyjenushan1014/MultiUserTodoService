import {
  z,
} from "zod";

const environmentSchema = z.object({
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
    .positive()
    .default(3000),

  REDIS_URL:
  z.string()
    .min(1),

RATE_LIMIT_KEY_PREFIX:
  z.string()
    .min(1)
    .default(
      "todo-platform:rate-limit",
    ),

GENERAL_RATE_LIMIT_MAX:
  z.coerce
    .number()
    .int()
    .positive()
    .default(100),

GENERAL_RATE_LIMIT_WINDOW_SECONDS:
  z.coerce
    .number()
    .int()
    .positive()
    .default(60),

AUTH_RATE_LIMIT_MAX:
  z.coerce
    .number()
    .int()
    .positive()
    .default(10),

AUTH_RATE_LIMIT_WINDOW_SECONDS:
  z.coerce
    .number()
    .int()
    .positive()
    .default(60),

PASSWORD_RESET_RATE_LIMIT_MAX:
  z.coerce
    .number()
    .int()
    .positive()
    .default(5),

PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS:
  z.coerce
    .number()
    .int()
    .positive()
    .default(900),

  

  ACCOUNT_SERVICE_URL: z
    .url(),

  TODO_SERVICE_URL:
  z.url(
    "TODO_SERVICE_URL must be a valid URL",
  ),

  RABBITMQ_MANAGEMENT_URL: z
    .url()
    .default("http://rabbitmq:15672"),

  RABBITMQ_USER: z
    .string()
    .min(1),

  RABBITMQ_PASSWORD: z
    .string()
    .min(1),

  MAILPIT_URL: z
    .url()
    .default("http://mailpit:8025"),

  TODO_OWNER_QUEUE: z
    .string()
    .min(1)
    .default("todo.owner-projection"),

  RABBITMQ_NOTIFICATION_QUEUE: z
    .string()
    .min(1)
    .default("todo.notifications"),

  TODO_HISTORY_QUEUE: z
    .string()
    .min(1)
    .default("todo.history"),

  TODO_OUTBOX_WORKER_ID: z
    .string()
    .min(1)
    .default("todo-outbox-worker"),

  ACCOUNT_OUTBOX_WORKER_ID: z
    .string()
    .min(1)
    .default("account-outbox-worker"),

  DOWNSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(30000)
    .default(5000),

  REQUEST_BODY_LIMIT: z
    .string()
    .min(1)
    .default("100kb"),

  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(32),

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
   INTERNAL_IDENTITY_TTL_SECONDS:
  z.coerce
    .number()
    .int()
    .min(5)
    .max(60)
    .default(30),

  

  LOG_LEVEL: z
    .string()
    .default("info"),
});

export const env =
  environmentSchema.parse(process.env);