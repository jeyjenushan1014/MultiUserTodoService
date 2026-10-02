import { connect } from "amqplib";
import { z } from "zod";

import { database } from "../dist/config/database.js";
import { env } from "../dist/config/env.js";

const requestId = z.uuid().parse(process.argv[2]);
let connection;
let channel;

try {
  const event = await database.query(
    `SELECT id FROM outbox_events
     WHERE request_id = $1 AND event_type = 'account.password-reset-requested'
     ORDER BY occurred_at DESC LIMIT 1`,
    [requestId],
  );
  const eventId = event.rows[0]?.id;
  if (eventId === undefined) {
    console.log(JSON.stringify({ found: false }));
  } else {
    const delivery = await database.query(
      `SELECT status, attempts, destination FROM notification_event_deliveries
       WHERE event_id = $1`,
      [eventId],
    );
    connection = await connect(env.RABBITMQ_URL);
    channel = await connection.createChannel();
    const dlq = await channel.checkQueue(env.RABBITMQ_NOTIFICATION_DLQ);
    const row = delivery.rows[0];
    console.log(JSON.stringify({
      found: true,
      eventId,
      deliveryStatus: row?.status ?? null,
      attempts: row?.attempts ?? 0,
      destination: row?.destination ?? null,
      dlqCount: dlq.messageCount,
    }));
  }
} finally {
  if (channel !== undefined) await channel.close();
  if (connection !== undefined) await connection.close();
  await database.end();
}