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