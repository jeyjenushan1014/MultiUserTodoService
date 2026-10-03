import { connect } from "amqplib";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const MAX_SCAN_MESSAGES = 1000;
const CONSUMER_RETRY_HEADERS = {
  "todo.history.dlq": "x-todo-history-retry-count",
  "todo.owner-projection.dlq": "x-todo-owner-retry-count",
};

export function parseOptions(args, env) {
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
  const allowedQueues = new Set([
    env.RABBITMQ_NOTIFICATION_DLQ,
    "todo.owner-projection.dlq",
    "todo.history.dlq",
  ]);

  if (!queue || !allowedQueues.has(queue)) {
    throw new Error("--queue must name a configured dead-letter queue");
  }
  if (command === "replay" && !eventId) {
    throw new Error("Replay requires --event-id <uuid>");
  }
  if (eventId) z.uuid().parse(eventId);
  return { command, queue, eventId };
}

export function summarize(message) {
  let eventId;
  let eventType;
  let occurredAt;
  let payloadStatus = "invalid";
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
      payloadStatus = eventId ? "valid-identity" : "invalid-identity";
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
    payloadStatus,
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

export async function operateDlq({ options, operatorId, channel, deliveryRepository, audit, env }) {
  if (options.command === "replay" && (!operatorId || operatorId.length > 100)) {
    throw new Error("DLQ_OPERATOR_ID must identify the operator (1-100 characters)");
  }

  const held = [];
  let selected;
  let auditId;
  let publishAttempted = false;
  try {
    const targetQueue = options.queue === env.RABBITMQ_NOTIFICATION_DLQ
      ? env.RABBITMQ_NOTIFICATION_QUEUE
      : options.queue.slice(0, -".dlq".length);
    if (options.command === "replay") await channel.checkQueue(targetQueue);
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
      return {
        command: "inspect",
        queue: options.queue,
        observed: summaries.length,
        messages: summaries,
      };
    }

    if (!selected) {
      throw new Error(`Event ${options.eventId} was not found in ${options.queue}`);
    }

    auditId = randomUUID();
    await audit.start(auditId, options, operatorId);
    let result = "queued";
    if (options.queue === env.RABBITMQ_NOTIFICATION_DLQ) {
      const replay = await deliveryRepository.resetForReplay(options.eventId);
      if (replay.status === "ready") {
        publishAttempted = true;
        channel.sendToQueue(env.RABBITMQ_NOTIFICATION_QUEUE, selected.content, {
          ...selected.properties,
          persistent: true,
          contentType: "application/json",
          headers: { ...selected.properties.headers, "x-notification-attempt": 1, operatorReplay: true },
        });
        await channel.waitForConfirms();
        await deliveryRepository.markReplayQueued(options.eventId, replay.processingToken);
      } else {
        result = "already-queued-or-delivered";
      }
    } else {
      const retryHeader = CONSUMER_RETRY_HEADERS[options.queue];
      const headers = { ...selected.properties.headers, operatorReplay: true };
      if (retryHeader) headers[retryHeader] = 0;
      publishAttempted = true;
      channel.sendToQueue(targetQueue, selected.content, {
        ...selected.properties,
        persistent: true,
        headers,
      });
      await channel.waitForConfirms();
    }

    await audit.finish(auditId, result === "queued" ? "queued" : "already_processed");
    channel.ack(selected);
    selected = undefined;
    return {
      command: "replay",
      queue: options.queue,
      eventId: options.eventId,
      operatorId,
      result,
    };
  } catch (error) {
    if (auditId) await audit.finish(auditId, publishAttempted ? "outcome_uncertain" : "failed");
    throw error;
  } finally {
    if (selected) channel.nack(selected, false, true);
    for (const message of held) channel.nack(message, false, true);
  }
}

export async function main(args = process.argv.slice(2)) {
  const { database } = await import("../dist/config/database.js");
  let connection;
  let channel;
  try {
    const { env } = await import("../dist/config/env.js");
    const { PostgresNotificationDeliveryRepository } = await import("../dist/notifications/postgres-notification-delivery.repository.js");
    const options = parseOptions(args, env);
    connection = await connect(env.RABBITMQ_URL);
    channel = await connection.createConfirmChannel();
    const audit = {
      async start(id, selection, operatorId) {
        await database.query(
          `INSERT INTO dlq_operation_audit (id, event_id, source_queue, operator_id, status)
           VALUES ($1, $2, $3, $4, 'started')`,
          [id, selection.eventId, selection.queue, operatorId],
        );
      },
      async finish(id, status) {
        const result = await database.query(
          `UPDATE dlq_operation_audit SET status = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [id, status],
        );
        if (result.rowCount !== 1) throw new Error("DLQ replay audit record was not found");
      },
    };
    console.log(JSON.stringify(await operateDlq({
      options, operatorId: process.env.DLQ_OPERATOR_ID?.trim(), channel,
      deliveryRepository: new PostgresNotificationDeliveryRepository(), audit, env,
    })));
  } finally {
    try {
      await channel?.close();
    } finally {
      try { await connection?.close(); } finally { await database.end(); }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "DLQ operation failed");
    process.exitCode = 1;
  });
}