import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = process.env.DAY4_COMPOSE_PROJECT;
if (!project?.startsWith("todo-day4-verify-") || process.env.COMPOSE_PROJECT_NAME !== project) {
  throw new Error("Operator rehearsal requires the disposable verify:day4 Compose project");
}

function docker(args, input) {
  const result = spawnSync("docker", ["compose", "-p", project, ...args], {
    encoding: "utf8", input, timeout: 120_000, env: process.env,
  });
  if (result.error || result.status !== 0) {
    let diagnostic = String(result.stderr || result.error?.message || "nonzero exit");
    for (const name of ["ACCOUNT_DATABASE_URL", "TODO_DATABASE_URL", "RABBITMQ_URL",
      "ACCOUNT_POSTGRES_PASSWORD", "TODO_POSTGRES_PASSWORD", "RABBITMQ_PASSWORD", "JWT_SECRET", "INTERNAL_SERVICE_SECRET"]) {
      if (process.env[name]) diagnostic = diagnostic.replaceAll(process.env[name], "[REDACTED]");
    }
    throw new Error(`Operator rehearsal command failed (${args[0]}): ${diagnostic}`);
  }
  return result.stdout;
}

function json(output) {
  const lines = output.trim().split(/\r?\n/);
  return JSON.parse(lines.at(-1));
}

function probe(service, code, identity) {
  return json(docker(["exec", "-T", ...(identity ? ["-e", identity] : []),
    service, "node", "--input-type=module"], code));
}

function command(service, script, args, identity) {
  const identities = identity ? Array.isArray(identity) ? identity : [identity] : [];
  return json(docker(["exec", "-T", ...identities.flatMap((value) => ["-e", value]),
    service, "node", script, ...args]));
}

const accountDbImport = `import { database } from "./apps/account-service/dist/config/database.js";`;
const todoDbImport = `import { database } from "./apps/todo-service/dist/src/config/database.js";`;
const brokerImport = `import { connect } from "amqplib";
const connection = await connect(process.env.RABBITMQ_URL);
const channel = await connection.createConfirmChannel();`;
const closeBroker = `await channel.close(); await connection.close();`;
const consumers = ["account-notification-consumer", "todo-owner-consumer", "todo-history-worker"];
const targetQueues = ["todo.notifications", "todo.owner-projection", "todo.history"];
const ids = targetQueues.map(() => randomUUID());
const sentinelId = randomUUID();
const historyIds = [randomUUID(), randomUUID(), randomUUID()];
const capIds = Array.from({ length: 101 }, () => randomUUID());
const todoId = randomUUID();
const actorId = randomUUID();
const requestId = randomUUID();
const ownerReplayEventId = randomUUID();
const ownerReplayUserId = randomUUID();
const ownerReplayRequestId = randomUUID();
const tombstoneEventId = randomUUID();
const tombstoneUserId = randomUUID();
const tombstoneRequestId = randomUUID();
const ownerReplayIds = [ownerReplayEventId, tombstoneEventId];
const ownerReplayUserIds = [ownerReplayUserId, tombstoneUserId];
const tombstoneUserHash = createHash("sha256").update(tombstoneUserId).digest("hex");
const from = new Date(Date.now() - 60_000);
const to = new Date(from.getTime() + 2);
const identity = "day4-isolated-rehearsal";

function queueCounts() {
  return probe("account-service", `${brokerImport}
const states = {};
for (const name of ${JSON.stringify(targetQueues)}) states[name] = (await channel.checkQueue(name)).messageCount;
console.log(JSON.stringify(states)); ${closeBroker}`);
}

let stopped = false;
try {
  const sink = probe("account-service", `
import { env } from "./apps/account-service/dist/config/env.js";
console.log(JSON.stringify({ sinkOnly: env.MAIL_TEST_SINK_ONLY }));`);
  assert.equal(sink.sinkOnly, "true", "Rehearsal must never send external mail");
  const deadline = Date.now() + 30_000;
  while (Object.values(queueCounts()).some((count) => count !== 0)) {
    if (Date.now() > deadline) throw new Error("Consumer queues did not drain before rehearsal");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stopped = true;
  docker(["stop", ...consumers]);
  const before = queueCounts();
  assert.deepEqual(Object.values(before), [0, 0, 0]);

  probe("account-service", `${accountDbImport} ${brokerImport}
const ids = ${JSON.stringify(ids)};
await database.query(
  "INSERT INTO notification_event_deliveries (event_id, status, processing_token, lease_until) VALUES ($1, 'dead_letter', $2, CURRENT_TIMESTAMP)",
  [ids[0], ${JSON.stringify(randomUUID())}]);
for (const [index, queue] of ${JSON.stringify(targetQueues)}.entries()) {
  channel.sendToQueue(queue + ".dlq", Buffer.from(JSON.stringify({
    eventId: ids[index], eventType: "rehearsal.synthetic", occurredAt: new Date().toISOString(),
    payload: { email: "private@example.test", token: "never-print-this" }
  })), { persistent: true, messageId: ids[index], headers: {
    "x-notification-attempt": 3, "x-todo-history-retry-count": 5, "x-todo-owner-retry-count": 5
  }});
}
channel.sendToQueue("todo.history.dlq", Buffer.from(JSON.stringify({
  eventId: ${JSON.stringify(sentinelId)}, payload: { email: "private@example.test" }
})), { persistent: true });
await channel.waitForConfirms();
console.log(JSON.stringify({ seeded: ids.length })); ${closeBroker} await database.end();`);

  for (const [index, queue] of targetQueues.entries()) {
    const inspected = command("account-service", "apps/account-service/scripts/dlq-operations.mjs",
      ["inspect", "--queue", `${queue}.dlq`]);
    assert.ok(inspected.messages.some((entry) => entry.eventId === ids[index]));
    assert.equal(JSON.stringify(inspected).includes("private@example"), false);
    assert.equal(JSON.stringify(inspected).includes("never-print"), false);
    const counts = queueCounts();
    const replay = command("account-service", "apps/account-service/scripts/dlq-operations.mjs",
      ["replay", "--queue", `${queue}.dlq`, "--event-id", ids[index]], `DLQ_OPERATOR_ID=${identity}`);
    assert.equal(replay.result, "queued");
    const after = queueCounts();
    for (const name of targetQueues) assert.equal(after[name], counts[name] + (name === queue ? 1 : 0));
    const received = probe("account-service", `${brokerImport}
const message = await channel.get(${JSON.stringify(queue)}, { noAck: false });
if (!message) throw new Error("Replayed message missing");
const body = JSON.parse(message.content.toString());
if (body.eventId !== ${JSON.stringify(ids[index])}) { channel.nack(message, false, true); throw new Error("Unexpected queue message"); }
channel.ack(message);
console.log(JSON.stringify({ eventId: body.eventId, headers: message.properties.headers }));
${closeBroker}`);
    assert.equal(received.eventId, ids[index]);
    const header = ["x-notification-attempt", "x-todo-owner-retry-count", "x-todo-history-retry-count"][index];
    assert.equal(received.headers[header], index === 0 ? 1 : 0);
  }
  const sentinel = command("account-service", "apps/account-service/scripts/dlq-operations.mjs",
    ["inspect", "--queue", "todo.history.dlq"]);
  assert.ok(sentinel.messages.some((entry) => entry.eventId === sentinelId), "Inspection/replay must retain unrelated DLQ messages");

  const notification = probe("account-service", `${accountDbImport}
import { PostgresNotificationDeliveryRepository } from "./apps/account-service/dist/notifications/postgres-notification-delivery.repository.js";
const repository = new PostgresNotificationDeliveryRepository();
const first = await repository.claim(${JSON.stringify(ids[0])}, 1);
if (first.status !== "claimed") throw new Error("Notification replay could not be claimed");
await repository.markSent(${JSON.stringify(ids[0])}, first.processingToken);
const duplicate = await repository.claim(${JSON.stringify(ids[0])}, 1);
const audit = await database.query("SELECT status FROM dlq_operation_audit WHERE event_id = ANY($1::uuid[])", [${JSON.stringify(ids)}]);
console.log(JSON.stringify({ duplicate: duplicate.status, audit: audit.rows }));
await database.end();`);
  assert.equal(notification.duplicate, "completed");
  assert.equal(notification.audit.length, 3);
  assert.ok(notification.audit.every((entry) => entry.status === "queued"));

  probe("todo-service", `${todoDbImport}
const ids = ${JSON.stringify(historyIds)};
for (const [index, id] of ids.entries()) {
  const occurredAt = new Date(${from.getTime()} + index);
  const envelope = { eventId: id, eventType: "todo.created", eventVersion: 1, producer: "todo-service",
    requestId: ${JSON.stringify(requestId)}, occurredAt: occurredAt.toISOString(),
    payload: { todoId: ${JSON.stringify(todoId)}, ownerId: ${JSON.stringify(actorId)} } };
  await database.query(
    "INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, event_version, payload, request_id, occurred_at, published_at) VALUES ($1, 'todo', $2, 'todo.created', 1, $3, $4, $5, CURRENT_TIMESTAMP)",
    [id, ${JSON.stringify(todoId)}, envelope, ${JSON.stringify(requestId)}, occurredAt]);
}
import { PostgresTodoHistoryRepository } from "./apps/todo-service/dist/src/history/todo-history.repository.js";
await new PostgresTodoHistoryRepository().append({ eventId: ids[0], todoId: ${JSON.stringify(todoId)},
  actorId: ${JSON.stringify(actorId)}, eventType: "todo.created", requestId: ${JSON.stringify(requestId)},
  occurredAt: new Date(${from.getTime()}), details: {} });
console.log(JSON.stringify({ seeded: 3 })); await database.end();`);
  const range = ["--from", from.toISOString(), "--to", to.toISOString(), "--target", "todo-history"];
  const dry = command("todo-service", "apps/todo-service/scripts/replay-event.mjs", range);
  assert.equal(dry.selected, 2);
  assert.equal(dry.alreadyProcessed, 1);
  assert.deepEqual(Object.values(queueCounts()), [0, 0, 0], "Dry-run must not publish");
  const applied = command("todo-service", "apps/todo-service/scripts/replay-event.mjs",
    [...range, "--apply"], `TODO_EVENT_REPLAY_OPERATOR_ID=${identity}`);
  assert.deepEqual(applied.events.map((entry) => entry.result), ["already-processed", "queued"]);
  assert.deepEqual(Object.values(queueCounts()), [0, 0, 1]);
  const duplicate = probe("todo-service", `${todoDbImport} ${brokerImport}
import { PostgresTodoHistoryRepository } from "./apps/todo-service/dist/src/history/todo-history.repository.js";
const message = await channel.get("todo.history", { noAck: false });
if (!message) throw new Error("History replay missing");
const event = JSON.parse(message.content.toString());
if (event.eventId !== ${JSON.stringify(historyIds[1])}) { channel.nack(message, false, true); throw new Error("Unexpected history event"); }
const input = { eventId: event.eventId, todoId: event.payload.todoId, actorId: event.payload.ownerId,
  eventType: event.eventType, requestId: event.requestId, occurredAt: new Date(event.occurredAt), details: {} };
const repository = new PostgresTodoHistoryRepository();
const first = await repository.append(input);
const second = await repository.append(input);
channel.ack(message);
console.log(JSON.stringify({ first, second })); ${closeBroker} await database.end();`);
  assert.deepEqual(duplicate, { first: true, second: false });
  const repeated = command("todo-service", "apps/todo-service/scripts/replay-event.mjs",
    [...range, "--apply"], `TODO_EVENT_REPLAY_OPERATOR_ID=${identity}`);
  assert.ok(repeated.events.every((entry) => entry.result === "already-processed"));
  assert.deepEqual(Object.values(queueCounts()), [0, 0, 0]);

  const todoDatabaseUrl = docker(["exec", "-T", "todo-service", "printenv", "TODO_DATABASE_URL"]).trim();
  if (!todoDatabaseUrl) throw new Error("Isolated Todo database URL is unavailable");
  process.env.TODO_DATABASE_URL = todoDatabaseUrl;
  const ownerOccurredAt = new Date(Date.now() - 5_000);
  probe("account-service", `${accountDbImport}
const rows = [
  { id: ${JSON.stringify(ownerReplayEventId)}, userId: ${JSON.stringify(ownerReplayUserId)},
    requestId: ${JSON.stringify(ownerReplayRequestId)}, eventType: "account.registered",
    version: 2, payload: { userId: ${JSON.stringify(ownerReplayUserId)},
      email: "owner-replay@example.test", registrationMethod: "password" } },
  { id: ${JSON.stringify(tombstoneEventId)}, userId: ${JSON.stringify(tombstoneUserId)},
    requestId: ${JSON.stringify(tombstoneRequestId)}, eventType: "account.email-changed",
    version: 1, payload: { userId: ${JSON.stringify(tombstoneUserId)},
      email: "tombstoned-owner@example.test" } }
];
for (const row of rows) {
  await database.query(
    "INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, event_version, payload, request_id, occurred_at, published_at) VALUES ($1, 'account', $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)",
    [row.id, row.userId, row.eventType, row.version, row.payload, row.requestId, new Date(${ownerOccurredAt.getTime()})]);
}
await database.end();
console.log(JSON.stringify({ seeded: rows.length }));`);

  probe("todo-service", `${todoDbImport}
await database.query(
  "INSERT INTO account_deletion_tombstones (user_id_hash) VALUES ($1)",
  [${JSON.stringify(tombstoneUserHash)}]);
await database.end();
console.log(JSON.stringify({ tombstoneSeeded: true }));`);

  const ownerDryRun = command("account-service", "apps/account-service/scripts/replay-owner-events.mjs",
    ["--from", ownerOccurredAt.toISOString(), "--to", new Date(ownerOccurredAt.getTime() + 1).toISOString()],
    `TODO_DATABASE_URL=${todoDatabaseUrl}`);
  assert.equal(ownerDryRun.selected, 2);
  assert.equal(ownerDryRun.eligible, 1);
  assert.equal(ownerDryRun.tombstoned, 1);
  assert.deepEqual(Object.values(queueCounts()), [0, 0, 0], "Owner range dry-run must not publish");
  docker(["start", "todo-owner-consumer"]);
  const ownerReplayProof = probe("account-service", `${accountDbImport}
import { Pool } from "pg";
import { replayOwnerEvents, runOwnerReplayRehearsal } from "./apps/account-service/scripts/replay-owner-events.mjs";
${brokerImport}
const todoDb = new Pool({ connectionString: process.env.TODO_DATABASE_URL });
try {
  const idempotency = await runOwnerReplayRehearsal({
    accountDb: database, todoDb, channel,
    eventId: ${JSON.stringify(ownerReplayEventId)},
    operatorId: ${JSON.stringify(identity)}
  });
  const beforeTombstoneReplay = (await channel.checkQueue("todo.owner-projection")).messageCount;
  const tombstoneReplay = await replayOwnerEvents({
    accountDb: database, todoDb, channel,
    selection: { kind: "event-id", eventId: ${JSON.stringify(tombstoneEventId)} },
    apply: true, operatorId: ${JSON.stringify(identity)}
  });
  const afterTombstoneReplay = (await channel.checkQueue("todo.owner-projection")).messageCount;
  const tombstoneReceipt = await todoDb.query(
    "SELECT event_id FROM processed_events WHERE event_id = $1 AND consumer_name = 'todo-owner-projection'",
    [${JSON.stringify(tombstoneEventId)}]);
  const tombstoneAudit = await database.query(
    "SELECT status, error_code FROM owner_event_replay_audit WHERE event_id = $1 AND target_consumer = 'todo-owner-projection' AND operator_id = $2 ORDER BY requested_at DESC LIMIT 1",
    [${JSON.stringify(tombstoneEventId)}, ${JSON.stringify(identity)}]);
  if (tombstoneReplay.tombstoned !== 1 || tombstoneReplay.failed !== 1
      || tombstoneReceipt.rowCount !== 0 || beforeTombstoneReplay !== afterTombstoneReplay
      || tombstoneAudit.rows[0]?.status !== "failed"
      || tombstoneAudit.rows[0]?.error_code !== "account_deleted_tombstone") {
    throw new Error("Tombstone replay was not suppressed and audited");
  }
  console.log(JSON.stringify({
    idempotency,
    tombstone: { suppressed: true, auditedFailed: true, queued: 0, receipts: 0 }
  }));
} finally {
  await todoDb.end(); await database.end(); ${closeBroker}
}`, `TODO_DATABASE_URL=${todoDatabaseUrl}`);
  assert.equal(ownerReplayProof.idempotency.secondPass.queued, 0);
  assert.equal(ownerReplayProof.tombstone.suppressed, true);
  const ownerCliRepeat = command("account-service", "apps/account-service/scripts/replay-owner-events.mjs",
    ["--event-id", ownerReplayEventId, "--apply"],
    [`TODO_DATABASE_URL=${todoDatabaseUrl}`, `TODO_EVENT_REPLAY_OPERATOR_ID=${identity}`]);
  assert.equal(ownerCliRepeat.alreadyProcessed, 1);
  assert.equal(ownerCliRepeat.queued, 0);
  docker(["stop", "todo-owner-consumer"]);

  const audit = probe("todo-service", `${todoDbImport}
const result = await database.query("SELECT status FROM todo_event_replay_audit WHERE event_id = ANY($1::uuid[]) ORDER BY requested_at",
  [${JSON.stringify(historyIds)}]);
console.log(JSON.stringify(result.rows)); await database.end();`);
  assert.equal(audit.length, 4);
  assert.equal(audit.filter((entry) => entry.status === "queued").length, 1);
  const capTime = new Date(from.getTime() - 10_000);
  probe("todo-service", `${todoDbImport}
for (const id of ${JSON.stringify(capIds)}) {
  const envelope = { eventId: id, eventType: "todo.created", eventVersion: 1, producer: "todo-service",
    requestId: ${JSON.stringify(requestId)}, occurredAt: ${JSON.stringify(capTime.toISOString())},
    payload: { todoId: ${JSON.stringify(todoId)}, ownerId: ${JSON.stringify(actorId)} } };
  await database.query(
    "INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, event_version, payload, request_id, occurred_at, published_at) VALUES ($1, 'todo', $2, 'todo.created', 1, $3, $4, $5, CURRENT_TIMESTAMP)",
    [id, ${JSON.stringify(todoId)}, envelope, ${JSON.stringify(requestId)}, ${JSON.stringify(capTime.toISOString())}]);
}
console.log(JSON.stringify({ seeded: 101 })); await database.end();`);
  const capRange = ["--from", capTime.toISOString(), "--to", new Date(capTime.getTime() + 1).toISOString(),
    "--target", "todo-history"];
  assert.throws(() => command("todo-service", "apps/todo-service/scripts/replay-event.mjs", capRange), /exceeds 100/);
  probe("todo-service", `${todoDbImport}
await database.query("DELETE FROM outbox_events WHERE id = $1", [${JSON.stringify(capIds[100])}]);
console.log(JSON.stringify({ removed: 1 })); await database.end();`);
  assert.equal(command("todo-service", "apps/todo-service/scripts/replay-event.mjs", capRange).selected, 100);
  assert.deepEqual(Object.values(queueCounts()), [0, 0, 0], "Cap validation must not publish");
  console.log("OP-2/OP-3 passed: audited DLQ targets, redaction, unrelated-message preservation, history half-open replay, exact 100/101 cap, owner processed_events idempotency, tombstone suppression and isolation.");
} finally {
  if (stopped) {
    try {
      probe("account-service", `${accountDbImport} ${brokerImport}
const selected = new Set(${JSON.stringify([...ids, sentinelId, ...ownerReplayIds])});
for (const queue of ${JSON.stringify(targetQueues.flatMap((name) => [name, `${name}.dlq`]))}) {
  const held = [];
  const count = (await channel.checkQueue(queue)).messageCount;
  for (let index = 0; index < count; index += 1) {
    const message = await channel.get(queue, { noAck: false });
    if (!message) break;
    let id;
    try { id = JSON.parse(message.content.toString()).eventId; } catch { id = undefined; }
    if (selected.has(id)) channel.ack(message); else held.push(message);
  }
  for (const message of held) channel.nack(message, false, true);
}
await database.query("DELETE FROM notification_event_deliveries WHERE event_id = ANY($1::uuid[])", [${JSON.stringify(ids)}]);
await database.query("DELETE FROM owner_event_replay_audit WHERE event_id = ANY($1::uuid[])", [${JSON.stringify(ownerReplayIds)}]);
await database.query("DELETE FROM outbox_events WHERE id = ANY($1::uuid[])", [${JSON.stringify(ownerReplayIds)}]);
console.log(JSON.stringify({ cleaned: true })); ${closeBroker} await database.end();`);
      probe("todo-service", `${todoDbImport}
await database.query("DELETE FROM processed_events WHERE event_id = ANY($1::uuid[])", [${JSON.stringify(ownerReplayIds)}]);
await database.query("DELETE FROM todo_owner_pending_email_changes WHERE user_id = ANY($1::uuid[])", [${JSON.stringify(ownerReplayUserIds)}]);
await database.query("DELETE FROM todo_owners WHERE id = ANY($1::uuid[])", [${JSON.stringify(ownerReplayUserIds)}]);
await database.query("DELETE FROM account_deletion_tombstones WHERE user_id_hash = $1", [${JSON.stringify(tombstoneUserHash)}]);
await database.query("DELETE FROM todo_history WHERE event_id = ANY($1::uuid[])", [${JSON.stringify(historyIds)}]);
await database.query("DELETE FROM outbox_events WHERE id = ANY($1::uuid[])", [${JSON.stringify([...historyIds, ...capIds])}]);
console.log(JSON.stringify({ cleaned: true })); await database.end();`);
    } finally {
      docker(["start", ...consumers]);
    }
  }
}
