import type { ConfirmChannel } from "amqplib";

type QueueMessage = Exclude<Awaited<ReturnType<ConfirmChannel["get"]>>, false>;

export function messageContainsAccountIdentifier(content: Buffer, userId: string, email: string): boolean {
  const body = content.toString("utf8");
  return body.includes(userId) || body.toLowerCase().includes(email.toLowerCase());
}

async function republishAndAcknowledge(channel: ConfirmChannel, message: QueueMessage): Promise<void> {
  const published = channel.publish(message.fields.exchange, message.fields.routingKey, message.content, message.properties);
  if (!published) {
    await new Promise<void>((resolve) => channel.once("drain", resolve));
  }
  await channel.waitForConfirms();
  channel.ack(message);
}

export async function purgeQueueMessages(
  channel: ConfirmChannel,
  queue: string,
  userId: string,
  email: string,
): Promise<void> {
  const queueState = await channel.checkQueue(queue);
  for (let index = 0; index < queueState.messageCount; index += 1) {
    const message = await channel.get(queue, { noAck: false });
    if (message === false) break;
    if (messageContainsAccountIdentifier(message.content, userId, email)) {
      channel.ack(message);
    } else {
      await republishAndAcknowledge(channel, message);
    }
  }
}

export async function inspectQueueMessages(
  channel: ConfirmChannel,
  queue: string,
  userId: string,
  email: string,
): Promise<number> {
  const queueState = await channel.checkQueue(queue);
  let matchingMessages = 0;
  for (let index = 0; index < queueState.messageCount; index += 1) {
    const message = await channel.get(queue, { noAck: false });
    if (message === false) break;
    if (messageContainsAccountIdentifier(message.content, userId, email)) {
      matchingMessages += 1;
    }
    await republishAndAcknowledge(channel, message);
  }
  return matchingMessages;
}