/*
This file manage the runtime configuration of the application.
Environment variables are read from .env.
Zod checks every required value.
The application stops immediately if configuration is invalid.
The error identifies the invalid variable
*/
import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),

  JWT_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(86400)
    .default(900),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
    
  CACHE_TTL_SECONDS: z.coerce
  .number()
  .int()
  .positive()
  .max(3600)
  .default(60),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const reasons = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid runtime configuration: ${reasons}`);
}

export const env = result.data;