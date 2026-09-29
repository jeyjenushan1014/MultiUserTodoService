import amqp from "amqplib";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { Channel, ChannelModel, ConsumeMessage } from "amqplib";
import type { WorkspaceMembershipChangedEventV1 } from "@todo/contracts";
import { WORKSPACE_ROLES } from "@todo/contracts";
import { cacheMembership, removeMembership } from "../security/workspace-membership.cache.js";

const workspaceMembershipEventSchema = z.object({
  eventType: z.literal("workspace.membership-changed"),
  payload: z.object({
    workspaceId: z.string(),
    userId: z.string(),
    role: z.enum(WORKSPACE_ROLES).nullable(),
    changedAt: z.string(),
  }) satisfies z.ZodType<WorkspaceMembershipChangedEventV1["payload"]>,
});

let shutdownStarted = false;
let activeConnection: ChannelModel | undefined;

function toEpochSeconds(isoTimestamp: string): number {
  return Math.floor(new Date(isoTimestamp).getTime() / 1000);
}

async function handleMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
  try {
    const parsed = JSON.parse(message.content.toString("utf8")) as unknown;

    await processWorkspaceMembershipEventObject(parsed);

    channel.ack(message);
  } catch (error) {
    logger.error({ error }, "Todo workspace-membership processing failed; requeueing");
    channel.nack(message, false, true);
  }
}

/**
 * Test-friendly processor: accepts a parsed event object and updates the cache.
 * Exported for unit tests so the consumer connection logic does not need to run.
 */
export async function processWorkspaceMembershipEventObject(obj: unknown): Promise<void> {
  const parsed = workspaceMembershipEventSchema.parse(obj );

  const { workspaceId, userId, role, changedAt } = parsed.payload;

  const changedAtEpoch = toEpochSeconds(changedAt);

  if (role === null) {
    await removeMembership(userId, workspaceId, changedAtEpoch);
  } else {
    await cacheMembership(userId, workspaceId, role);
  }
}

async function run(): Promise<void> {
  while (!shutdownStarted) {
    try {
      const connection = await amqp.connect(env.RABBITMQ_URL);

      activeConnection = connection;

      connection.once("close", () => {
        logger.warn("Todo workspace-membership RabbitMQ connection closed; reconnecting");
      });

      connection.on("error", (error) => {
        logger.warn({ err: error }, "Todo workspace-membership RabbitMQ connection error");
      });

      const channel = await connection.createChannel();

      await channel.assertExchange(env.RABBITMQ_EXCHANGE, "topic", { durable: true });

      await channel.assertQueue(env.TODO_WORKSPACE_MEMBERSHIP_QUEUE, { durable: true });

      await channel.bindQueue(env.TODO_WORKSPACE_MEMBERSHIP_QUEUE, env.RABBITMQ_EXCHANGE, "workspace.membership-changed");

      await channel.prefetch(10);

      await channel.consume(env.TODO_WORKSPACE_MEMBERSHIP_QUEUE, (message) => {
        if (message === null) return;
        void handleMessage(channel, message);
      });

      logger.info("Todo workspace-membership consumer started");

      const connectionClosed = new Promise<void>((resolve) => {
        connection.once("close", resolve);
      });

      await connectionClosed;
    } catch (error) {
      logger.warn({ err: error }, "Todo workspace-membership consumer failed to start; retrying");
      await new Promise<void>((resolve) => { setTimeout(resolve, 2000).unref(); });
    }
  }
}

export function startWorkspaceMembershipConsumer(): void {
  void run();
}

export async function stopWorkspaceMembershipConsumer(): Promise<void> {
  shutdownStarted = true;

  if (activeConnection !== undefined) {
    await activeConnection.close();
  }
}
