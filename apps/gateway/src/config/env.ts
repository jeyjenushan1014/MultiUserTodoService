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

  ACCOUNT_SERVICE_URL: z
    .url(),

  TODO_SERVICE_URL:
  z.url(
    "TODO_SERVICE_URL must be a valid URL",
  ),

  DOWNSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(30000)
    .default(5000),

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