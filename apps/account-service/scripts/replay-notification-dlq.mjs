import { connect } from "amqplib";
import { z } from "zod";

import { database } from "../dist/config/database.js";
import { env } from "../dist/config/env.js";
import { PostgresNotificationDeliveryRepository } from "../dist/notifications/postgres-notification-delivery.repository.js";

const eventId = z.uuid().parse(process.argv[2]);
const connection = await connect(env.RABBITMQ_URL);
const channel = await connection.createConfirmChannel();
const repository = new PostgresNotificationDeliveryRepository();
const held = [];
let selected;

function matchesEvent(message) {
  try {
    const event = JSON.parse(message.content.toString("utf8"));
    return typeof event === "object" && event !== null && event.eventId === eventId;
  } catch {
    return false;
  }
}

try {
  const state = await channel.checkQueue(env.RABBITMQ_NOTIFICATION_DLQ);
  if (state.messageCount > 1000) {
    throw new Error("Notification DLQ exceeds the bounded replay scan (1000 messages)");
  }

  for (let index = 0; index < state.messageCount; index += 1) {
    const message = await channel.get(env.RABBITMQ_NOTIFICATION_DLQ, { noAck: false });
    if (message === false) break;
    if (matchesEvent(message)) {
      selected = message;
      break;
    }
    held.push(message);
  }

  if (selected === undefined) {
    throw new Error(`Notification ${eventId} was not found in the DLQ`);
  }

  const result = await repository.resetForReplay(eventId);
  if (result.status === "ready") {
    channel.sendToQueue(env.RABBITMQ_NOTIFICATION_QUEUE, selected.content, {
      persistent: true,
      headers: { "x-notification-attempt": 1 },
    });
    await channel.waitForConfirms();
    await repository.markReplayQueued(eventId, result.processingToken);
  }
  channel.ack(selected);
  selected = undefined;
  console.log(result.status === "ready" ? "Notification queued for replay" : "Already queued or delivered; stale DLQ copy removed");
} finally {
  if (selected !== undefined) channel.nack(selected, false, true);
  for (const message of held) channel.nack(message, false, true);
  await channel.close();
  await connection.close();
  await database.end();
}