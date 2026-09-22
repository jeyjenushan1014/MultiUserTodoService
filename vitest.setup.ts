/*
 * Shared environment configuration for automated tests.
 *
 * These values are safe test-only values.
 * Real development and production secrets must not be added here.
 */

process.env.NODE_ENV ??=
  "test";

process.env.LOG_LEVEL ??=
  "silent";

/*
 * Gateway configuration
 */
process.env.PORT ??=
  "3000";

process.env.ACCOUNT_SERVICE_URL ??=
  "http://account-service:3001";

process.env.DOWNSTREAM_TIMEOUT_MS ??=
  "5000";

process.env.REDIS_URL ??=
  "redis://localhost:6379";

/*
 * Account Service configuration
 */
process.env.ACCOUNT_DATABASE_URL ??=
  "postgres://account_user:account_password@localhost:5432/account_db";

process.env.PASSWORD_HASH_ROUNDS ??=
  "10";

process.env.RABBITMQ_URL ??=
  "amqp://guest:guest@localhost:5672";

/*
 * Shared internal service authentication.
 *
 * This is only a test secret.
 * It contains more than 32 characters.
 */
process.env.INTERNAL_SERVICE_SECRET ??=
  "test-internal-service-secret-with-more-than-32-characters";

process.env.JWT_SECRET ??=
  "test-jwt-secret-containing-more-than-32-characters";

process.env.JWT_ISSUER ??=
  "todo-account-service";

process.env.JWT_AUDIENCE ??=
  "todo-platform";

process.env.ACCESS_TOKEN_TTL_SECONDS ??=
  "900";

process.env.REFRESH_TOKEN_TTL_SECONDS ??=
  "604800";