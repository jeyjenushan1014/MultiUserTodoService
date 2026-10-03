import { connect } from "amqplib";
import { z } from "zod";

import { database } from "../dist/config/database.js";
import { env } from "../dist/config/env.js";
import { PostgresNotificationDeliveryRepository } from "../dist/notifications/postgres-notification-delivery.repository.js";

const MAX_SCAN_MESSAGES = 1000;
const CONSUMER_RETRY_HEADERS = {
  "todo.history.dlq": "x-todo-history-retry-count",
  "todo.owner-projection.dlq": "x-todo-owner-retry-count",
};

function parseOptions(args) {
  const [command, ...values] = args;
  if (command !== "inspect" && command !== "replay") {
    throw new Error("Usage: dlq-operations.mjs inspect|replay --queue <allowed-dlq> [--event-id <uuid>]");
  }

  const options = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name !== "--queue" && name !== "--event-id") {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = values[index + 1];
    if (!value || value.startsWith("--") || options.has(name)) {
      throw new Error(`${name} requires one value and may only be specified once`);
    }
    options.set(name, value);
    index += 1;
  }

  const queue = options.get("--queue");
  const eventId = options.get("--event-id");
  const allowedQueues = new Set(
    env.ACCOUNT_DELETION_BROKER_QUEUES
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.endsWith(".dlq")),
  );

  if (!queue || !allowedQueues.has(queue)) {
    throw new Error("--queue must name a configured dead-letter queue");
  }
  if (command === "replay" && !eventId) {
    throw new Error("Replay requires --event-id <uuid>");
  }
  if (eventId) z.uuid().parse(eventId);
  return { command, queue, eventId };
}

function summarize(message) {
  let eventId;
  let eventType;
  let occurredAt;
  try {
    const event = JSON.parse(message.content.toString("utf8"));
    if (event && typeof event === "object") {
      eventId = typeof event.eventId === "string" && z.uuid().safeParse(event.eventId).success
        ? event.eventId
        : undefined;
      eventType = typeof event.eventType === "string" && /^[a-z0-9.-]{1,150}$/i.test(event.eventType)
        ? event.eventType
        : undefined;
      occurredAt = typeof event.occurredAt === "string" && Number.isFinite(Date.parse(event.occurredAt))
        ? event.occurredAt
        : undefined;
    }
  } catch {
    // Invalid payload details are intentionally not printed.
  }

  const failureReason = message.properties.headers?.failureReason;

  return {
    eventId,
    eventType,
    occurredAt,
    failureReason: typeof failureReason === "string" && /^[a-z0-9_-]{1,80}$/i.test(failureReason)
      ? failureReason
      : undefined,
    redacted: true,
  };
}

function matchesEvent(message, eventId) {
  try {
    const event = JSON.parse(message.content.toString("utf8"));
    return event && typeof event === "object" && event.eventId === eventId;
  } catch {
    return false;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const operatorId = process.env.DLQ_OPERATOR_ID?.trim();
  if (options.command === "replay" && (!operatorId || operatorId.length > 100)) {
    throw new Error("DLQ_OPERATOR_ID must identify the operator (1-100 characters)");
  }

  const connection = await connect(env.RABBITMQ_URL);
  const channel = await connection.createConfirmChannel();
  const held = [];
  let selected;
  try {
    const queueState = await channel.checkQueue(options.queue);
    if (queueState.messageCount > MAX_SCAN_MESSAGES) {
      throw new Error(`Queue exceeds the bounded scan (${MAX_SCAN_MESSAGES} messages)`);
    }

    const summaries = [];
    for (let index = 0; index < queueState.messageCount; index += 1) {
      const message = await channel.get(options.queue, { noAck: false });
      if (message === false) break;
      if (options.command === "replay" && matchesEvent(message, options.eventId)) {
        selected = message;
        break;
      }
      held.push(message);
      summaries.push(summarize(message));
    }

    if (options.command === "inspect") {
      console.log(JSON.stringify({
        command: "inspect",
        queue: options.queue,
        observed: summaries.length,
        messages: summaries,
      }));
      return;
    }

    if (!selected) {
      throw new Error(`Event ${options.eventId} was not found in ${options.queue}`);
    }

    let result = "queued";
    if (options.queue === env.RABBITMQ_NOTIFICATION_DLQ) {
      const deliveryRepository = new PostgresNotificationDeliveryRepository();
      const replay = await deliveryRepository.resetForReplay(options.eventId);
      if (replay.status === "ready") {
        channel.sendToQueue(env.RABBITMQ_NOTIFICATION_QUEUE, selected.content, {
          persistent: true,
          contentType: "application/json",
          headers: { "x-notification-attempt": 1 },
        });
        await channel.waitForConfirms();
        await deliveryRepository.markReplayQueued(options.eventId, replay.processingToken);
      } else {
        result = "already-queued-or-delivered";
      }
    } else {
      const targetQueue = options.queue.slice(0, -".dlq".length);
      const retryHeader = CONSUMER_RETRY_HEADERS[options.queue];
      const headers = { ...selected.properties.headers, operatorReplay: true };
      if (retryHeader) headers[retryHeader] = 0;
      channel.sendToQueue(targetQueue, selected.content, {
        ...selected.properties,
        persistent: true,
        headers,
      });
      await channel.waitForConfirms();
    }

    channel.ack(selected);
    selected = undefined;
    console.log(JSON.stringify({
      command: "replay",
      queue: options.queue,
      eventId: options.eventId,
      operatorId,
      result,
    }));
  } finally {
    if (selected) channel.nack(selected, false, true);
    for (const message of held) channel.nack(message, false, true);
    await channel.close();
    await connection.close();
    await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "DLQ operation failed");
  process.exitCode = 1;
});