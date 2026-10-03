import { randomBytes } from "node:crypto";
import { basename, isAbsolute } from "node:path";

export function isolatedHostEnvironment(inherited = process.env) {
  return Object.fromEntries(["PATH", "Path", "SystemRoot", "SYSTEMROOT", "HOME", "USERPROFILE",
    "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
    "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]
    .filter((key) => inherited[key] !== undefined).map((key) => [key, inherited[key]]));
}

export function mailVerificationEnvironment(project, secretDir, inherited = process.env) {
  if (!/^todo-mail-verify-[a-f0-9]{10}$/.test(project) ||
    typeof secretDir !== "string" || !isAbsolute(secretDir) ||
    basename(secretDir) !== `${project}-empty-secrets`) {
    throw new Error("Mail rehearsal requires its own generated project and matching absolute scratch directory");
  }
  const secret = () => randomBytes(32).toString("hex");
  const env = {
    ...isolatedHostEnvironment(inherited),
    COMPOSE_PROJECT_NAME: project,
    APP_RELEASE_ID: project,
    ACCOUNT_POSTGRES_USER: "mail_verify_account",
    ACCOUNT_POSTGRES_PASSWORD: secret(),
    ACCOUNT_POSTGRES_DB: "mail_verify_account",
    TODO_POSTGRES_USER: "mail_verify_todo",
    TODO_POSTGRES_PASSWORD: secret(),
    TODO_POSTGRES_DB: "mail_verify_todo",
    REDIS_PASSWORD: secret(),
    RABBITMQ_USER: "mail_verify_broker",
    RABBITMQ_PASSWORD: secret(),
    INTERNAL_SERVICE_SECRET: randomBytes(48).toString("hex"),
    JWT_SECRET: randomBytes(48).toString("hex"),
    CHAIN_WRITER_ADDRESS: "0x0000000000000000000000000000000000000001",
    TASK_HISTORY_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000002",
    TASK_HISTORY_DEPLOYMENT_BLOCK: "1",
    CHAIN_ID: "31337",
    CHAIN_CONFIRMATIONS: "2",
    CONTAINER_CHAIN_RPC_URL: "http://127.0.0.1:1",
    CHAIN_SECRET_DIR: secretDir,
    API_PORT: "0",
    MAILPIT_SMTP_PORT: "0",
    MAILPIT_HTTP_PORT: "0",
    RABBITMQ_AMQP_PORT: "0",
    RABBITMQ_MANAGEMENT_PORT: "0",
    MAIL_TEST_SINK_ONLY: "true",
    MAIL_HOST: "mailpit",
    MAIL_PORT: "1025",
    MAIL_FROM: "no-reply@todo.local",
    MAIL_PROVIDER_HOST: "",
    MAIL_PROVIDER_FROM: "",
    MAIL_SECRET_DIR: secretDir,
    MAIL_RETRY_FIRST_MS: "3000",
    MAIL_RETRY_SECOND_MS: "4000",
    MAIL_CONNECTION_TIMEOUT_MS: "1000",
    MAIL_GREETING_TIMEOUT_MS: "1000",
    MAIL_SOCKET_TIMEOUT_MS: "1000",
    LOG_LEVEL: "warn",
  };
  env.ACCOUNT_DATABASE_URL = `postgres://${env.ACCOUNT_POSTGRES_USER}:${env.ACCOUNT_POSTGRES_PASSWORD}@account-postgres:5432/${env.ACCOUNT_POSTGRES_DB}`;
  env.TODO_DATABASE_URL = `postgres://${env.TODO_POSTGRES_USER}:${env.TODO_POSTGRES_PASSWORD}@todo-postgres:5432/${env.TODO_POSTGRES_DB}`;
  env.RABBITMQ_URL = `amqp://${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}@rabbitmq:5672`;
  env.REDIS_URL = `redis://:${env.REDIS_PASSWORD}@redis:6379`;
  return env;
}
