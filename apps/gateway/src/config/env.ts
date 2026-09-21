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

  DOWNSTREAM_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(30000)
    .default(5000),

  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(32),

  LOG_LEVEL: z
    .string()
    .default("info"),
});

export const env =
  environmentSchema.parse(process.env);