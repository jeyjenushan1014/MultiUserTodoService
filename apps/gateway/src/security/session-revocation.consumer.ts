import amqp from "amqplib";

import type {
  ChannelModel,
  Channel,
  ConsumeMessage,
} from "amqplib";

import {
  z,
} from "zod";

import type {
  AccountSessionRevokedPayload,
} from "@todo/contracts";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  cacheAccountRevoked,
  cacheSessionRevoked,
} from "./session-revocation.cache.js";

const sessionRevokedEventSchema =
  z.object({
    eventType: z.literal(
      "account.session-revoked",
    ),
    payload: z.object({
      userId: z.uuid(),
      sessionId:
        z.uuid().nullable(),
      revokedAt: z.string(),
    }) satisfies z.ZodType<AccountSessionRevokedPayload>,
  });

let shutdownStarted =
  false;

let activeConnection:
  ChannelModel | undefined;

function toEpochSeconds(
  isoTimestamp: string,
): number {
  return Math.floor(
    new Date(isoTimestamp).getTime() /
      1000,
  );
}

async function handleMessage(
  channel: Channel,
  message: ConsumeMessage,
): Promise<void> {
  try {
    const parsed =
      sessionRevokedEventSchema.safeParse(
        JSON.parse(
          message.content.toString("utf8"),
        ) as unknown,
      );

    if (!parsed.success) {
      /*
       * Malformed events cannot be repaired by
       * retrying; discard rather than block the queue.
       */
      channel.nack(message, false, false);
      return;
    }

    const {
      userId,
      sessionId,
      revokedAt,
    } =
      parsed.data.payload;

    const revokedAtEpochSeconds =
      toEpochSeconds(revokedAt);

    if (sessionId === null) {
      await cacheAccountRevoked(
        userId,
        revokedAtEpochSeconds,
      );
    } else {
      await cacheSessionRevoked(
        sessionId,
        revokedAtEpochSeconds,
      );
    }

    channel.ack(message);
  } catch (error) {
    logger.error(
      {
        error,
      },
      "Session-revocation processing failed; requeueing",
    );

    /*
     * Redis being down must not lose a revocation, so this
     * requeues instead of dead-lettering.
     */
    channel.nack(message, false, true);
  }
}

async function run(): Promise<void> {
  while (!shutdownStarted) {
    try {
      const connection =
        await amqp.connect(
          env.RABBITMQ_URL,
        );

      activeConnection =
        connection;

      connection.once(
        "close",
        () => {
          logger.warn(
            "Gateway session-revocation RabbitMQ connection closed; reconnecting",
          );
        },
      );

      connection.on(
        "error",
        (error) => {
          logger.warn(
            {
              err: error,
            },
            "Gateway session-revocation RabbitMQ connection error",
          );
        },
      );

      const channel =
        await connection.createChannel();

      await channel.assertExchange(
        env.RABBITMQ_EXCHANGE,
        "topic",
        {
          durable: true,
        },
      );

      await channel.assertQueue(
        env.GATEWAY_SESSION_REVOCATION_QUEUE,
        {
          durable: true,
        },
      );

      await channel.bindQueue(
        env.GATEWAY_SESSION_REVOCATION_QUEUE,
        env.RABBITMQ_EXCHANGE,
        "account.session-revoked",
      );

      await channel.prefetch(10);

      await channel.consume(
        env.GATEWAY_SESSION_REVOCATION_QUEUE,
        (message) => {
          if (message === null) {
            return;
          }

          void handleMessage(
            channel,
            message,
          );
        },
      );

      logger.info(
        "Gateway session-revocation consumer started",
      );

      const connectionClosed =
        new Promise<void>(
          (resolve) => {
            connection.once(
              "close",
              resolve,
            );
          },
        );

      await connectionClosed;
    } catch (error) {
      logger.warn(
        {
          err: error,
        },
        "Gateway session-revocation consumer failed to start; retrying",
      );

      await new Promise<void>(
        (resolve) => {
          setTimeout(resolve, 2_000).unref();
        },
      );
    }
  }
}

export function startSessionRevocationConsumer(): void {
  void run();
}

export async function stopSessionRevocationConsumer(): Promise<void> {
  shutdownStarted = true;

  if (activeConnection !== undefined) {
    await activeConnection.close();
  }
}
