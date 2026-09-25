import amqp from "amqplib";

import type {
  ConfirmChannel,
  ChannelModel,
} from "amqplib";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import type {
  EventPublisher,
} from "./event-publisher.interface.js";

import type {
  PublishedEventEnvelope,
} from "./outbox.types.js";

export class RabbitMqEventPublisher
implements EventPublisher {
  private connection:
    ChannelModel | undefined;

  private channel:
    ConfirmChannel | undefined;

  private isReady = false;

  public get ready(): boolean {
    return this.isReady;
  }

  public async connect(): Promise<void> {
    if (this.isReady) {
      return;
    }

    const connection =
      await amqp.connect(
        env.RABBITMQ_URL,
      );

    const channel =
      await connection
        .createConfirmChannel();

    connection.on(
      "error",
      (error) => {
        this.isReady = false;

        logger.error(
          {
            err: error,
          },
          "RabbitMQ connection error",
        );
      },
    );

    connection.on(
      "close",
      () => {
        this.isReady = false;
        this.channel = undefined;
        this.connection = undefined;

        logger.warn(
          "RabbitMQ connection closed",
        );
      },
    );

    channel.on(
      "error",
      (error) => {
        this.isReady = false;

        logger.error(
          {
            err: error,
          },
          "RabbitMQ channel error",
        );
      },
    );

    channel.on(
      "close",
      () => {
        this.isReady = false;
        this.channel = undefined;

        logger.warn(
          "RabbitMQ channel closed",
        );
      },
    );

    await this.configureTopology(
      channel,
    );

    this.connection = connection;
    this.channel = channel;
    this.isReady = true;

    logger.info(
      {
        exchange:
          env.RABBITMQ_EXCHANGE,
      },
      "RabbitMQ publisher connected",
    );
  }

  public async publish(
    event: PublishedEventEnvelope,
  ): Promise<void> {
    const channel =
      this.channel;

    if (
      !this.isReady ||
      channel === undefined
    ) {
      throw new Error(
        "RabbitMQ publisher is not connected",
      );
    }

    const body =
      Buffer.from(
        JSON.stringify(event),
        "utf8",
      );

    await new Promise<void>(
      (resolve, reject) => {
        channel.publish(
          env.RABBITMQ_EXCHANGE,
          event.eventType,
          body,
          {
            persistent: true,

            contentType:
              "application/json",

            contentEncoding:
              "utf-8",

            messageId:
              event.eventId,

            type:
              event.eventType,

            correlationId:
              event.requestId,

            timestamp:
              Date.parse(
                event.occurredAt,
              ),

            headers: {
              eventVersion:
                event.eventVersion,

              producer:
                event.producer,
            },
          },
          (error) => {
            if (error !== null) {
              reject(
                error instanceof Error
                  ? error
                  : new Error(
                    String(error),
                  ),
              );

              return;
            }

            resolve();
          },
        );
      },
    );
  }

  public async close(): Promise<void> {
    this.isReady = false;

    const channel =
      this.channel;

    const connection =
      this.connection;

    this.channel = undefined;
    this.connection = undefined;

    if (channel !== undefined) {
      try {
        await channel.close();
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "RabbitMQ channel close failed",
        );
      }
    }

    if (connection !== undefined) {
      try {
        await connection.close();
      } catch (error) {
        logger.warn(
          {
            err: error,
          },
          "RabbitMQ connection close failed",
        );
      }
    }
  }

  private async configureTopology(
    channel: ConfirmChannel,
  ): Promise<void> {
    await channel.assertExchange(
      env.RABBITMQ_EXCHANGE,
      "topic",
      {
        durable: true,
      },
    );

    await channel.assertExchange(
      env.RABBITMQ_DEAD_LETTER_EXCHANGE,
      "topic",
      {
        durable: true,
      },
    );

    await channel.assertQueue(
      env.RABBITMQ_NOTIFICATION_DLQ,
      {
        durable: true,
      },
    );

    await channel.bindQueue(
      env.RABBITMQ_NOTIFICATION_DLQ,
      env.RABBITMQ_DEAD_LETTER_EXCHANGE,
      "notification.failed",
    );

    await channel.assertQueue(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      {
        durable: true,

        arguments: {
          "x-dead-letter-exchange":
            env.RABBITMQ_DEAD_LETTER_EXCHANGE,

          "x-dead-letter-routing-key":
            "notification.failed",
        },
      },
    );

    await channel.bindQueue(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      env.RABBITMQ_EXCHANGE,
      "account.password-reset-requested",
    );
  }
}