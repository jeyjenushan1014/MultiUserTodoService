#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";

const keepStack = process.env.DAY4_KEEP_STACK === "1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const runId = `${Date.now()}-${process.pid}`;
const projectName = `todo-day4-verify-${runId}`;
const releaseId = `day4-verify-${runId}`;

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a verification API port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

const apiPort = Number(process.env.DAY4_API_PORT) || await findAvailablePort();
const accountPassword = randomBytes(24).toString("hex");
const todoPassword = randomBytes(24).toString("hex");
const redisPassword = randomBytes(24).toString("hex");
const rabbitPassword = randomBytes(24).toString("hex");
const internalSecret = randomBytes(48).toString("hex");
const jwtSecret = randomBytes(48).toString("hex");
const verificationEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: projectName,
  DAY4_COMPOSE_PROJECT: projectName,
  APP_RELEASE_ID: releaseId,
  API_PORT: String(apiPort),
  TODO_E2E_BASE_URL: `http://127.0.0.1:${apiPort}`,
  DAY4_HEALTH_URL: `http://127.0.0.1:${apiPort}/health/dependencies`,
  ACCOUNT_POSTGRES_USER: "day4_account",
  ACCOUNT_POSTGRES_PASSWORD: accountPassword,
  ACCOUNT_POSTGRES_DB: "day4_account_db",
  TODO_POSTGRES_USER: "day4_todo",
  TODO_POSTGRES_PASSWORD: todoPassword,
  TODO_POSTGRES_DB: "day4_todo_db",
  REDIS_PASSWORD: redisPassword,
  RABBITMQ_USER: "day4_broker",
  RABBITMQ_PASSWORD: rabbitPassword,
  RABBITMQ_URL: `amqp://day4_broker:${rabbitPassword}@rabbitmq:5672`,
  TODO_DATABASE_URL: `postgres://day4_todo:${todoPassword}@todo-postgres:5432/day4_todo_db`,
  ACCOUNT_DATABASE_URL: `postgres://day4_account:${accountPassword}@account-postgres:5432/day4_account_db`,
  INTERNAL_SERVICE_SECRET: internalSecret,
  JWT_SECRET: jwtSecret,
  CHAIN_WRITER_ADDRESS: "0x0000000000000000000000000000000000000002",
  TASK_HISTORY_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
  CHAIN_ID: "31337",
  TASK_HISTORY_DEPLOYMENT_BLOCK: "1",
  MAIL_TEST_SINK_ONLY: "true",
  MAIL_SECRET_DIR: "./secrets/mail",
  MAIL_PROVIDER_HOST: "",
  MAIL_PROVIDER_FROM: "",
  CONTAINER_CHAIN_RPC_URL: "http://host.docker.internal:8545",
  RABBITMQ_URL: `amqp://day4_broker:${rabbitPassword}@rabbitmq:5672`,
  RABBITMQ_AMQP_PORT: "0",
  RABBITMQ_MANAGEMENT_PORT: "0",
  MAILPIT_SMTP_PORT: "0",
  MAILPIT_HTTP_PORT: "0",
};

function run(command, args, label) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32" && command === npmCommand,
    env: verificationEnv,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

async function waitForHealth() {
  const url = verificationEnv.DAY4_HEALTH_URL;
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "healthy") {
          console.log(`Healthy: ${url}`);
          return;
        }
      }
    } catch {
      // The stack may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Stack did not become healthy within 120 seconds: ${url}`);
}

async function assertHealthPortIsAvailable() {
  const url = verificationEnv.DAY4_HEALTH_URL;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    if (response.ok || response.status > 0) {
      throw new Error(
        `Refusing to start: ${url} already responds. Stop the other stack or configure an isolated verification port.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing to start:")) {
      throw error;
    }
  }
}

let verificationError;
try {
  console.log(`Using isolated Compose project: ${projectName}`);
  run(npmCommand, ["ci"], "Install locked dependencies for this clone");
  await assertHealthPortIsAvailable();
  run("docker", ["compose", "down", "-v", "--remove-orphans"], "Reset disposable verification state");
  run("docker", ["compose", "up", "-d", "--build"], "Build and start the complete stack");
  await waitForHealth();

  run(npmCommand, ["run", "check"], "Lint, build, and unit tests");
  run(npmCommand, ["run", "test:docs"], "API documentation verification");
  run(npmCommand, ["run", "verify:authorization"], "AUT-1 through AUT-5 verification");
  run(npmCommand, ["run", "test:e2e", "-w", "@todo/gateway"], "Complete live E2E suite");
  run(npmCommand, ["run", "verify:mail"], "Sink-only mail failure, DLQ and replay verification");
  run(
    "docker",
    ["compose", "exec", "-T", "account-service", "node", "apps/account-service/scripts/verify-workspace-concurrency.mjs"],
    "TN-9 PostgreSQL concurrency proof",
  );
  run(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "todo-service",
      "sh",
      "-c",
      "node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key \"$INTERNAL_SERVICE_SECRET\"",
    ],
    "TN-11 repeatable backfill dry-run",
  );

  console.log("\nDay 4 verification passed for all currently implemented checks.");
} catch (error) {
  verificationError = error;
} finally {
  if (!keepStack) {
    try {
      run("docker", ["compose", "down", "-v", "--remove-orphans"], "Clean verification stack");
    } catch (cleanupError) {
      console.error(`Cleanup failed: ${cleanupError.message}`);
      if (verificationError === undefined) {
        verificationError = cleanupError;
      }
    }
  } else {
    console.log("DAY4_KEEP_STACK=1: verification stack left running for inspection.");
  }
}

if (verificationError !== undefined) {
  console.error(`\nDay 4 verification failed: ${verificationError.message}`);
  process.exitCode = 1;
}
