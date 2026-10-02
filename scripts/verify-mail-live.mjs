#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";

const project = `todo-mail-verify-${randomBytes(5).toString("hex")}`;
const secretDir = join(tmpdir(), `${project}-empty-secrets`);
const composeEnvironment = {
  ...process.env,
  ACCOUNT_POSTGRES_USER: "mail_verify_account",
  ACCOUNT_POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
  ACCOUNT_POSTGRES_DB: "mail_verify_account",
  TODO_POSTGRES_USER: "mail_verify_todo",
  TODO_POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
  TODO_POSTGRES_DB: "mail_verify_todo",
  REDIS_PASSWORD: randomBytes(32).toString("hex"),
  RABBITMQ_USER: "mail_verify_broker",
  RABBITMQ_PASSWORD: randomBytes(32).toString("hex"),
  INTERNAL_SERVICE_SECRET: randomBytes(48).toString("hex"),
  JWT_SECRET: randomBytes(48).toString("hex"),
  CHAIN_WRITER_ADDRESS: "0x0000000000000000000000000000000000000001",
  TASK_HISTORY_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000002",
  TASK_HISTORY_DEPLOYMENT_BLOCK: "1",
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
};
const compose = ["compose", "-p", project];
const deadlineMs = 600_000;

function runDocker(args, { capture = false, quiet = false } = {}) {
  const result = spawnSync("docker", [...compose, ...args], {
    cwd: process.cwd(),
    env: composeEnvironment,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : quiet ? "ignore" : "inherit",
    timeout: deadlineMs,
  });
  if (result.error || result.status !== 0) {
    const credentials = [
      composeEnvironment.ACCOUNT_POSTGRES_PASSWORD,
      composeEnvironment.TODO_POSTGRES_PASSWORD,
      composeEnvironment.REDIS_PASSWORD,
      composeEnvironment.RABBITMQ_PASSWORD,
      composeEnvironment.INTERNAL_SERVICE_SECRET,
      composeEnvironment.JWT_SECRET,
    ];
    let diagnostic = String(result.stderr ?? result.error?.message ?? "Docker failed")
      .split(/\r?\n/).filter(Boolean).slice(-8).join("; ");
    for (const credential of credentials) {
      diagnostic = diagnostic.replaceAll(credential, "[REDACTED]");
    }
    throw new Error(`Mail verification Docker command failed: ${args[0]}; ${diagnostic}`);
  }
  return capture ? result.stdout.trim() : "";
}

function publishedUrl(service, port) {
  const output = runDocker(["port", service, String(port)], { capture: true });
  const match = /:(\d+)\s*$/.exec(output);
  assert.ok(match, `No published ${service} port ${port}`);
  assert.notEqual(match[1], "0", `Docker did not allocate a host port for ${service}`);
  return `http://127.0.0.1:${match[1]}`;
}

async function waitFor(check, label, timeoutMilliseconds = deadlineMs) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result !== undefined && result !== false) return result;
    } catch {
      // The isolated stack may still be starting or handling a retry.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Mail verification timed out waiting for ${label}`);
}

async function boundedFetch(url, options = {}, timeoutMilliseconds = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(url, body) {
  const response = await boundedFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }, 10_000);
  return response;
}

function probe(requestId) {
  const output = runDocker([
    "exec", "-T", "account-service", "node",
    "apps/account-service/scripts/verify-mail-live-probe.mjs", requestId,
  ], { capture: true });
  return JSON.parse(output);
}

async function mailpitContains(mailpitUrl, email) {
  const response = await boundedFetch(`${mailpitUrl}/api/v1/messages?limit=50`);
  if (!response.ok) return false;
  const data = await response.json();
  return Array.isArray(data.messages) && data.messages.some((message) =>
    message.Subject === "Reset your password" &&
    Array.isArray(message.To) && message.To.some((recipient) =>
      recipient.Address?.toLowerCase() === email));
}

let started = false;
try {
  const configuration = JSON.parse(runDocker(["config", "--format", "json"], { capture: true }));
  const workerEnvironment = configuration.services["account-notification-consumer"].environment;
  assert.equal(workerEnvironment.MAIL_TEST_SINK_ONLY, "true");
  assert.equal(workerEnvironment.MAIL_HOST, "mailpit");
  assert.equal(String(workerEnvironment.MAIL_PORT), "1025");
  assert.equal(workerEnvironment.MAIL_PROVIDER_HOST, "");
  assert.equal(workerEnvironment.MAIL_PROVIDER_FROM, "");

  started = true;
  console.log("Starting isolated sink-only mail verification stack...");
  runDocker([
    "up", "-d", "--no-build", "redis", "rabbitmq",
    "account-postgres", "todo-postgres", "mailpit",
  ], { capture: true });
  await waitFor(() => {
    const status = runDocker([
      "exec", "-T", "rabbitmq", "rabbitmq-diagnostics", "-q", "ping",
    ], { capture: true });
    return status.length > 0;
  }, "stable RabbitMQ before worker startup", 90_000);

  runDocker([
    "up", "-d", "--build", "--scale", "account-service=2",
    "--scale", "account-notification-consumer=2", "edge",
    "redis", "account-outbox-worker", "account-notification-consumer",
    "todo-owner-consumer",
  ], { capture: true });

  const gatewayUrl = publishedUrl("edge", 3000);
  let mailpitUrl = publishedUrl("mailpit", 8025);
  console.log(`Local proof ports: gateway ${gatewayUrl}; Mailpit ${mailpitUrl}`);
  let lastGatewayStatus = "connection unavailable";
  await waitFor(async () => {
    const response = await boundedFetch(`${gatewayUrl}/health`);
    lastGatewayStatus = `HTTP ${response.status}`;
    if (!response.ok) return false;
    return (await response.json()).status === "healthy";
  }, "ready local gateway", 30_000).catch((error) => {
    throw new Error(`${error.message}; host gateway last status: ${lastGatewayStatus}`);
  });
  console.log("Isolated gateway is ready; mail dependencies will be checked by delivery evidence.");

  const email = `mail-proof-${randomUUID()}@example.test`;
  const registration = await requestJson(`${gatewayUrl}/api/v1/auth/register`, {
    email, password: "OnlyForLocalProof123!",
  });
  assert.equal(registration.status, 201, "Test account registration must succeed");

  const login = await requestJson(`${gatewayUrl}/api/v1/auth/login`, {
    email, password: "OnlyForLocalProof123!",
  });
  assert.equal(login.status, 200, "Test account login must succeed");
  const accessToken = (await login.json()).data?.accessToken;
  assert.equal(typeof accessToken, "string");
  const createTodo = (title, idempotencyKey) => boundedFetch(`${gatewayUrl}/api/v1/todos`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ title }),
  }, 8000);
  const baselineKey = randomUUID();
  let baselineFailure = "not checked";
  await waitFor(async () => {
    const response = await createTodo("mail-proof-baseline", baselineKey);
    if (response.status === 503) {
      const errorBody = await response.json();
      baselineFailure = `HTTP 503 ${errorBody.error?.code ?? "unknown"}`;
      return false;
    }
    assert.equal(response.status, 201, "Baseline TODO create must work before mail outage");
    return true;
  }, "owner projection for baseline TODO", 30_000).catch((error) => {
    let ownerWorkerState = "unknown";
    try {
      const containers = runDocker(["ps", "--format", "json"], { capture: true })
        .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      ownerWorkerState = containers.find((container) =>
        container.Service === "todo-owner-consumer")?.State ?? "not listed";
    } catch {
      ownerWorkerState = "diagnostic unavailable";
    }
    throw new Error(`${error.message}; last create: ${baselineFailure}; owner worker: ${ownerWorkerState}`);
  });

  runDocker(["stop", "mailpit"]);
  console.log("Mailpit stopped; triggering a real password-reset request.");
  const startedAt = Date.now();
  const reset = await requestJson(`${gatewayUrl}/api/v1/auth/password-reset/request`, { email });
  assert.equal(reset.status, 202, "Password reset must succeed during mail outage");
  assert.ok(Date.now() - startedAt < 8000, "Request waited for a failed SMTP send");
  const requestId = reset.headers.get("x-request-id");
  assert.match(requestId ?? "", /^[0-9a-f-]{36}$/i);

  const todoWrite = await createTodo("mail-proof-during-outage", randomUUID());
  assert.equal(todoWrite.status, 201, "Unrelated TODO write failed while Mailpit was stopped");
  const todoRead = await boundedFetch(`${gatewayUrl}/api/v1/todos`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }, 8000);
  assert.equal(todoRead.status, 200, "Unrelated TODO read failed while Mailpit was stopped");
  console.log("Unrelated authenticated TODO read and write succeeded during the mail outage.");

  await waitFor(() => {
    const result = probe(requestId);
    return result.attempts >= 2 && result.destination === "sink" ? result : false;
  }, "a delayed retry while Mailpit is stopped", 90_000);

  const exhausted = await waitFor(() => {
    const result = probe(requestId);
    return result.deliveryStatus === "dead_letter" && result.attempts === 3 &&
      result.dlqCount >= 1 ? result : false;
  }, "three failures and notification DLQ", 90_000);
  console.log("Two retries and a terminal notification DLQ entry observed.");
  assert.equal(await mailpitContains(mailpitUrl, email).catch(() => false), false);

  runDocker(["start", "mailpit"]);
  mailpitUrl = publishedUrl("mailpit", 8025);
  let recoveryStatus = "connection unavailable";
  await waitFor(async () => {
    const response = await boundedFetch(`${mailpitUrl}/readyz`);
    recoveryStatus = `HTTP ${response.status}`;
    return response.ok;
  }, "Mailpit recovery", 30_000).catch((error) => {
    throw new Error(`${error.message}; Mailpit last status: ${recoveryStatus}`);
  });

  runDocker([
    "exec", "-T", "account-service", "node",
    "apps/account-service/scripts/replay-notification-dlq.mjs", exhausted.eventId,
  ], { quiet: true });
  console.log("Mailpit restarted; DLQ event replayed to the local sink.");

  await waitFor(async () => {
    const result = probe(requestId);
    if (result.deliveryStatus !== "sent" || result.destination !== "sink") return false;
    return mailpitContains(mailpitUrl, email);
  }, "confirmed local replay and Mailpit delivery", 90_000);

  console.log("Mail verification passed: request survived Mailpit outage; retries, DLQ and local replay observed; no external provider contacted.");
} finally {
  if (started) {
    try {
      runDocker(["down", "-v", "--remove-orphans"], { quiet: true });
    } catch {
      console.error(`Disposable mail verification project ${project} needs manual cleanup`);
      process.exitCode = 1;
    }
  }
  await rm(secretDir, { recursive: true, force: true }).catch(() => {});
}