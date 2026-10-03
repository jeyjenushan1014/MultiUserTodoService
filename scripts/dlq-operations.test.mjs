import { test } from "node:test";
import assert from "node:assert/strict";
import { operateDlq, parseOptions, summarize } from "../apps/account-service/scripts/dlq-operations.mjs";

const eventId = "11111111-1111-4111-8111-111111111111";
const env = { RABBITMQ_NOTIFICATION_DLQ: "todo.notifications.dlq", RABBITMQ_NOTIFICATION_QUEUE: "todo.notifications" };
const message = (id = eventId) => ({
  content: Buffer.from(JSON.stringify({ eventId: id, email: "private@example.test", token: "secret" })),
  properties: { messageId: id, headers: { "x-todo-history-retry-count": 5 } },
});

function harness(messages = [message()]) {
  const calls = [];
  const channel = {
    async checkQueue(queue) { calls.push(["check", queue]); return { messageCount: messages.length }; },
    async get() { return messages.shift() ?? false; },
    sendToQueue(...args) { calls.push(["send", ...args]); },
    async waitForConfirms() { calls.push(["confirm"]); },
    ack(value) { calls.push(["ack", value]); },
    nack(...args) { calls.push(["nack", ...args]); },
  };
  const audit = {
    async start() { calls.push(["audit", "started"]); },
    async finish(_id, status) { calls.push(["audit", status]); },
  };
  return { channel, audit, calls, env, operatorId: "test-operator",
    options: parseOptions(["replay", "--queue", "todo.history.dlq", "--event-id", eventId], env) };
}

test("only the three supported DLQs can be selected", () => {
  assert.throws(() => parseOptions(["inspect", "--queue", "secret.dlq"], env), /configured dead-letter/);
  assert.throws(() => parseOptions(["replay", "--queue", "todo.history.dlq"], env), /event-id/);
  assert.throws(() => parseOptions(["inspect", "--queue", "todo.history.dlq", "--queue", "todo.history.dlq"], env), /once/);
});

test("inspection redacts payload and requeues every held message", async () => {
  const data = harness([message(), { content: Buffer.from("{broken"), properties: {} }]);
  data.options = parseOptions(["inspect", "--queue", "todo.history.dlq"], env);
  const result = await operateDlq(data);
  assert.equal(result.observed, 2);
  assert.equal(result.messages[1].payloadStatus, "invalid");
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(data.calls.filter(([kind]) => kind === "nack").length, 2);
  assert.equal(data.calls.some(([kind]) => kind === "send" || kind === "ack"), false);
  assert.equal(summarize(message()).redacted, true);
});

test("replay targets one queue, resets retry and audits confirmation before ack", async () => {
  const data = harness([message("22222222-2222-4222-8222-222222222222"), message()]);
  const result = await operateDlq(data);
  assert.equal(result.result, "queued");
  const send = data.calls.find(([kind]) => kind === "send");
  assert.equal(send[1], "todo.history");
  assert.equal(send[3].headers["x-todo-history-retry-count"], 0);
  assert.equal(send[3].messageId, eventId);
  assert.deepEqual(data.calls.slice(-4).map(([kind, value]) => [kind, typeof value === "string" ? value : undefined]),
    [["confirm", undefined], ["audit", "queued"], ["ack", undefined], ["nack", undefined]]);
});

test("uncertain publisher outcome retains original DLQ message and durable audit", async () => {
  const data = harness();
  data.channel.waitForConfirms = async () => { throw new Error("connection lost"); };
  await assert.rejects(operateDlq(data), /connection lost/);
  assert.equal(data.calls.some(([kind]) => kind === "ack"), false);
  assert.equal(data.calls.some(([kind]) => kind === "nack"), true);
  assert.deepEqual(data.calls.find(([kind, status]) => kind === "audit" && status === "outcome_uncertain"),
    ["audit", "outcome_uncertain"]);
});

test("missing destination fails before changing delivery state", async () => {
  const data = harness();
  data.channel.checkQueue = async (queue) => {
    if (queue === "todo.history") throw new Error("missing queue");
    return { messageCount: 1 };
  };
  await assert.rejects(operateDlq(data), /missing queue/);
  assert.equal(data.calls.some(([kind]) => kind === "audit" || kind === "send" || kind === "ack"), false);
  assert.equal(data.calls.some(([kind]) => kind === "nack"), false);
});

test("notification replay deduplicates a delivered event without publishing", async () => {
  const data = harness();
  data.options = parseOptions(["replay", "--queue", env.RABBITMQ_NOTIFICATION_DLQ, "--event-id", eventId], env);
  data.deliveryRepository = { async resetForReplay() { return { status: "completed" }; } };
  assert.equal((await operateDlq(data)).result, "already-queued-or-delivered");
  assert.equal(data.calls.some(([kind]) => kind === "send"), false);
  assert.equal(data.calls.some(([kind, status]) => kind === "audit" && status === "already_processed"), true);
});

test("large scans and unidentified operators are rejected", async () => {
  const data = harness();
  data.channel.checkQueue = async () => ({ messageCount: 1001 });
  await assert.rejects(operateDlq(data), /bounded scan/);
  await assert.rejects(operateDlq({ ...data, operatorId: "" }), /DLQ_OPERATOR_ID/);
});

test("the exact 1000-message bound can replay the last selected event", async () => {
  const data = harness([
    ...Array.from({ length: 999 }, () => message("22222222-2222-4222-8222-222222222222")),
    message(),
  ]);
  assert.equal((await operateDlq(data)).result, "queued");
  assert.equal(data.calls.filter(([kind]) => kind === "ack").length, 1);
  assert.equal(data.calls.filter(([kind]) => kind === "nack").length, 999);
});
