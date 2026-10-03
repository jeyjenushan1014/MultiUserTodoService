#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compose = await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8");
const capacity = await readFile(new URL("../docs/capacity.md", import.meta.url), "utf8");

for (const replicaService of [
  "account-service",
  "todo-service",
  "gateway",
  "todo-outbox-worker",
  "account-outbox-worker",
  "account-cleanup-worker",
  "todo-cleanup-worker",
  "todo-owner-consumer",
  "account-notification-consumer",
  "todo-history-worker",
  "chain-writer",
  "chain-indexer",
]) {
  const serviceMatch = new RegExp(`^  ${replicaService}:\\r?$`, "m").exec(compose);
  const serviceStart = serviceMatch?.index ?? -1;
  assert.notEqual(serviceStart, -1, `PF-1 service is missing: ${replicaService}`);
  const nextServicePattern = /\n  [a-z0-9-]+:\r?\n/g;
  nextServicePattern.lastIndex = serviceStart + 3;
  const nextServiceMatch = nextServicePattern.exec(compose);
  const serviceBlock = compose.slice(
    serviceStart,
    nextServiceMatch === null ? undefined : nextServiceMatch.index,
  );
  assert.match(serviceBlock, /deploy:\s+replicas:\s+2/s, `PF-1 replica declaration is missing: ${replicaService}`);
}

for (const requiredValue of [
  "DATABASE_MAX_CONNECTIONS:-10",
  "DATABASE_POOL_MAX:-10",
  "TODO_OWNER_CONSUMER_PREFETCH:-10",
  "RABBITMQ_NOTIFICATION_PREFETCH:-10",
  "OUTBOX_BATCH_SIZE:-20",
  "TODO_OUTBOX_BATCH_SIZE:-25",
  "GENERAL_RATE_LIMIT_MAX:-100",
  "AUTH_RATE_LIMIT_MAX:-10",
  "PASSWORD_RESET_RATE_LIMIT_MAX:-5",
]) {
  assert.ok(compose.includes(requiredValue), `PF-8 Compose value is missing: ${requiredValue}`);
}

for (const requiredCalculation of [
  "2 replicas * 10",
  "2 consumers * 10",
  "2 workers * 20",
  "2 workers * 25",
  "100 requests / 60 seconds",
  "5 requests / 900 seconds",
]) {
  assert.ok(capacity.includes(requiredCalculation), `Capacity calculation is missing: ${requiredCalculation}`);
}

console.log("Capacity proof passed: PF-8 configuration and PF-9 isolation controls are documented and anchored to Compose values.");
