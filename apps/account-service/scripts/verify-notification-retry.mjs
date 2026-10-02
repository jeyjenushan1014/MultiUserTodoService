import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { connect } from "amqplib";

import { database } from "../dist/config/database.js";
import { env } from "../dist/config/env.js";
import { PostgresNotificationDeliveryRepository } from "../dist/notifications/postgres-notification-delivery.repository.js";

const eventId = randomUUID();
const replayEventId = randomUUID();
const mainQueue = `notification.verify.main.${replayEventId}`;
const deadLetterQueue = `notification.verify.dlq.${replayEventId}`;
const retryQueue = `notification.verify.retry.${replayEventId}`;
const exchange = `notification.verify.exchange.${replayEventId}`;
const firstWorker = new PostgresNotificationDeliveryRepository();
const secondWorker = new PostgresNotificationDeliveryRepository();
let connection;
let channel;

try {
  const [first, second] = await Promise.all([
    firstWorker.claim(eventId, 1),
    secondWorker.claim(eventId, 1),
  ]);

  assert.deepEqual(
    [first.status, second.status].sort(),
    ["claimed", "in-progress"],
  );
  const firstToken = first.processingToken ?? second.processingToken;
  assert.ok(firstToken);

  await database.query(
    `UPDATE notification_event_deliveries
     SET lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second'
     WHERE event_id = $1`,
    [eventId],
  );
  const recovered = await secondWorker.claim(eventId, 1);
  assert.equal(recovered.status, "claimed");
  assert.notEqual(recovered.processingToken, firstToken);
  await assert.rejects(firstWorker.markSent(eventId, firstToken), /not owned/);

  await secondWorker.markFailed(eventId, recovered.processingToken, "transport failed");
  assert.equal((await firstWorker.claim(eventId, 1)).status, "retry-pending");

  const retry = await firstWorker.claim(eventId, 2);
  assert.equal(retry.status, "claimed");
  assert.equal((await secondWorker.claim(eventId, 1)).status, "stale");
  await firstWorker.markFailed(eventId, retry.processingToken, "transport failed");

  const lastAttempt = await secondWorker.claim(eventId, 3);
  assert.equal(lastAttempt.status, "claimed");
  await secondWorker.markFailed(eventId, lastAttempt.processingToken, "transport failed", true);
  assert.equal((await firstWorker.claim(eventId, 3)).status, "dead-letter-pending");
  await firstWorker.markDeadLetter(eventId);
  assert.equal((await secondWorker.claim(eventId, 3)).status, "completed");

  const firstReplay = await secondWorker.resetForReplay(eventId);
  assert.equal(firstReplay.status, "ready");
  await assert.rejects(firstWorker.resetForReplay(eventId), /not ready/);

  await database.query(
    `UPDATE notification_event_deliveries
     SET lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second'
     WHERE event_id = $1`,
    [eventId],
  );
  const recoveredReplay = await firstWorker.resetForReplay(eventId);
  assert.equal(recoveredReplay.status, "ready");
  await assert.rejects(
    secondWorker.markReplayQueued(eventId, firstReplay.processingToken),
    /lost its replay lease/,
  );
  await firstWorker.markReplayQueued(eventId, recoveredReplay.processingToken);
  assert.equal((await secondWorker.resetForReplay(eventId)).status, "completed");
  assert.equal((await firstWorker.claim(eventId, 3)).status, "stale");
  const replayed = await secondWorker.claim(eventId, 1);
  assert.equal(replayed.status, "claimed");
  await secondWorker.markSent(eventId, replayed.processingToken);
  assert.equal((await firstWorker.resetForReplay(eventId)).status, "completed");
  assert.equal((await firstWorker.claim(eventId, 1)).status, "completed");

  connection = await connect(env.RABBITMQ_URL);
  channel = await connection.createConfirmChannel();
  await channel.assertExchange(exchange, "topic", { durable: true });
  await channel.assertQueue(mainQueue, { durable: true });
  await channel.assertQueue(deadLetterQueue, { durable: true });
  await channel.assertQueue(retryQueue, {
    durable: true,
    deadLetterExchange: exchange,
    deadLetterRoutingKey: "notification.retry",
  });
  await channel.bindQueue(mainQueue, exchange, "notification.retry");

  const delayed = Buffer.from(JSON.stringify({ eventId: replayEventId, delayed: true }));
  channel.sendToQueue(retryQueue, delayed, {
    persistent: true,
    expiration: "250",
    headers: { "x-notification-attempt": 2 },
  });
  await channel.waitForConfirms();
  assert.equal(await channel.get(mainQueue, { noAck: false }), false);

  let delivered = false;
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && delivered === false) {
    const message = await channel.get(mainQueue, { noAck: false });
    if (message !== false) {
      assert.equal(message.content.toString("utf8"), delayed.toString("utf8"));
      assert.equal(message.properties.headers["x-notification-attempt"], 2);
      channel.ack(message);
      delivered = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.equal(delivered, true, "Delayed notification never returned to its queue");

  const terminal = await firstWorker.claim(replayEventId, 1);
  assert.equal(terminal.status, "claimed");
  await firstWorker.markFailed(replayEventId, terminal.processingToken, "transport failed", true);
  await firstWorker.markDeadLetter(replayEventId);

  const envelope = Buffer.from(JSON.stringify({ eventId: replayEventId }));
  channel.sendToQueue(deadLetterQueue, envelope, { persistent: true });
  await channel.waitForConfirms();

  const replay = spawnSync(
    process.execPath,
    ["apps/account-service/scripts/replay-notification-dlq.mjs", replayEventId],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
      env: {
        ...process.env,
        RABBITMQ_NOTIFICATION_QUEUE: mainQueue,
        RABBITMQ_NOTIFICATION_DLQ: deadLetterQueue,
      },
    },
  );
  assert.equal(replay.status, 0, replay.stderr);

  const replayedMessage = await channel.get(mainQueue, { noAck: false });
  assert.notEqual(replayedMessage, false);
  assert.equal(replayedMessage.content.toString("utf8"), envelope.toString("utf8"));
  assert.equal(replayedMessage.properties.headers["x-notification-attempt"], 1);
  channel.ack(replayedMessage);
  assert.equal((await channel.checkQueue(deadLetterQueue)).messageCount, 0);

  console.log("Notification retry concurrency, lease recovery, terminal fencing, and replay verified");
} finally {
  if (channel !== undefined) {
    await channel.deleteQueue(mainQueue);
    await channel.deleteQueue(deadLetterQueue);
    await channel.deleteQueue(retryQueue);
    await channel.deleteExchange(exchange);
    await channel.close();
  }
  if (connection !== undefined) await connection.close();
  await database.query(
    "DELETE FROM notification_event_deliveries WHERE event_id = ANY($1::uuid[])",
    [[eventId, replayEventId]],
  );
  await database.end();
}