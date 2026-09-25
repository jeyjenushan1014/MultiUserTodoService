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

process.env.RABBITMQ_USER ??=
  "guest";

process.env.RABBITMQ_PASSWORD ??=
  "guest";

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

process.env.TODO_SERVICE_PORT ??=
  "3002";

process.env.TODO_DATABASE_URL ??=
  "postgres://todo_user:todo_password@localhost:5433/todo_db";

process.env.REDIS_URL ??=
  "redis://localhost:6379";

process.env.INTERNAL_SERVICE_SECRET ??=
  "test-internal-service-secret-containing-at-least-32-characters";

process.env.REQUEST_BODY_LIMIT ??=
  "100kb";

process.env.LOG_LEVEL ??=
  "silent";

process.env.DATABASE_POOL_MAX ??=
  "10";

process.env.DATABASE_CONNECTION_TIMEOUT_MS ??=
  "5000";

process.env.DATABASE_IDLE_TIMEOUT_MS ??=
  "30000";

process.env.SHUTDOWN_TIMEOUT_MS ??=
  "10000";

process.env.RABBITMQ_URL ??=
  "amqp://todo_user:todo_password@localhost:5672";

process.env.RABBITMQ_EXCHANGE ??=
  "todo.events";

process.env.RABBITMQ_RETRY_EXCHANGE ??=
  "todo.events.retry";

process.env.RABBITMQ_DEAD_LETTER_EXCHANGE ??=
  "todo.events.dlx";

process.env.TODO_OWNER_QUEUE ??=
  "todo.owner-projection";

process.env.TODO_OWNER_RETRY_QUEUE ??=
  "todo.owner-projection.retry";

process.env.TODO_OWNER_DEAD_LETTER_QUEUE ??=
  "todo.owner-projection.dlq";

process.env.TODO_OWNER_CONSUMER_PREFETCH ??=
  "10";

process.env.TODO_OWNER_RETRY_DELAY_MS ??=
  "5000";

process.env.TODO_OWNER_MAX_RETRIES ??=
  "5";

process.env.TODO_SERVICE_URL ??=
  "http://localhost:3002";

process.env.INTERNAL_IDENTITY_MAX_AGE_SECONDS ??=
  "30";