import { resolve } from "node:path";
import { config } from "dotenv";
import {
  z,
} from "zod";

config({
  path: resolve(process.cwd(), "../../.env"),
});


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

  REDIS_URL: z
    .url(),

  ACCOUNT_SERVICE_URL: z
    .url(),

  JWT_SECRET: z
    .string()
    .min(32),

  JWT_ISSUER: z
    .string()
    .default("todo-account-service"),

  JWT_AUDIENCE: z
    .string()
    .default("todo-platform"),

  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(32),

  DOWNSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(2000),

  RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int()
    .positive()
    .default(100),

  RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60),

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
  environmentSchema.parse(process.env);