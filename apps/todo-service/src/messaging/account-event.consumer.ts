import amqp from "amqplib";

import type {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
  Options,
} from "amqplib";

import {
  ZodError,
} from "zod";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  accountRegisteredEventSchema,
} from "./account-event.schema.js";

import type {
  AccountRegisteredEvent,
} from "./account-event.schema.js";

import type {
  OwnerProjectionService,
} from "./owner-projection.service.js";

const ACCOUNT_REGISTERED_ROUTING_KEY =
  "account.registered";

const RETRY_COUNT_HEADER =
  "x-todo-owner-retry-count";

interface MessageProperties {
  readonly headers?: Record<string, unknown>;
  readonly contentType?: string;
  readonly contentEncoding?: string;
  readonly messageId?: string;
  readonly correlationId?: string;
  readonly type?: string;
  readonly timestamp?: number;
}

function getMessageProperties(
  message: ConsumeMessage,
): MessageProperties {
  return message.properties as unknown as MessageProperties;
}

function getRetryCount(
  message: ConsumeMessage,
): number {
  const headers =
    getMessageProperties(message).headers;

  const value =
    headers?.[
      RETRY_COUNT_HEADER
    ];

  return typeof value === "number"
    ? value
    : 0;
}

function createPublishOptions(
  message: ConsumeMessage,
  retryCount?: number,
): Options.Publish {
  const properties =
    getMessageProperties(message);

  const originalHeaders =
    properties.headers ??
    {};

  const headers =
    retryCount === undefined
      ? originalHeaders
      : {
          ...originalHeaders,

          [RETRY_COUNT_HEADER]:
            retryCount,
        };

  return {
    persistent: true,

    contentType:
      properties.contentType ??
      "application/json",

    contentEncoding:
      properties.contentEncoding ??
      "utf-8",

    ...(properties.messageId === undefined
      ? {}
      : {
          messageId:
            properties.messageId,
        }),

    ...(properties.correlationId === undefined
      ? {}
      : {
          correlationId:
            properties.correlationId,
        }),

    ...(properties.type === undefined
      ? {}
      : {
          type:
            properties.type,
        }),

    ...(properties.timestamp === undefined
      ? {}
      : {
          timestamp:
            properties.timestamp,
        }),

    headers,
  };
}

export class AccountEventConsumer {
  private connection:
    ChannelModel | undefined;

  private channel:
    ConfirmChannel | undefined;

  public constructor(
    private readonly service:
      OwnerProjectionService,
  ) {}

  public async start():
  Promise<void> {
    const connection =
      await amqp.connect(
        env.RABBITMQ_URL,
      );

    const channel =
      await connection
        .createConfirmChannel();

    connection.on(
      "error",
      (error: Error) => {
        logger.error(
          {
            err: error,
          },
          "TODO owner consumer RabbitMQ connection error",
        );
      },
    );

    connection.on(
      "close",
      () => {
        logger.warn(
          "TODO owner consumer RabbitMQ connection closed",
        );
      },
    );

    channel.on(
      "error",
      (error: Error) => {
        logger.error(
          {
            err: error,
          },
          "TODO owner consumer RabbitMQ channel error",
        );
      },
    );

    await this.configureTopology(
      channel,
    );

    await channel.prefetch(
      env
        .TODO_OWNER_CONSUMER_PREFETCH,
    );

    await channel.consume(
      env.TODO_OWNER_QUEUE,
      (message) => {
        if (message === null) {
          return;
        }

        void this.handleMessage(
          channel,
          message,
        );
      },
      {
        noAck: false,
      },
    );

    this.connection =
      connection;

    this.channel =
      channel;

    logger.info(
      {
        queue:
          env.TODO_OWNER_QUEUE,

        prefetch:
          env
            .TODO_OWNER_CONSUMER_PREFETCH,
      },
      "TODO owner projection consumer started",
    );
  }

  public async close():
  Promise<void> {
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
          "TODO owner consumer channel close failed",
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
          "TODO owner consumer connection close failed",
        );
      }
    }
  }

  private async handleMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      const event =
        this.parseEvent(
          message,
        );

      await this.service
        .handleAccountRegistered(
          event,
        );

      channel.ack(
        message,
      );
    } catch (error) {
      if (
        error instanceof ZodError ||
        error instanceof SyntaxError
      ) {
        await this.sendToDeadLetterQueue(
          channel,
          message,
          "invalid-message",
        );

        channel.ack(
          message,
        );

        logger.warn(
          {
            err: error,

            messageId:
              message.properties
                .messageId,
          },
          "Invalid account event moved to dead-letter queue",
        );

        return;
      }

      try {
        await this.retryOrDeadLetter(
          channel,
          message,
        );

        channel.ack(
          message,
        );
      } catch (
        retryPublicationError
      ) {
        logger.error(
          {
            err:
              retryPublicationError,

            processingError:
              error,

            messageId:
              message.properties
                .messageId,
          },
          "Failed to schedule owner event retry",
        );

        /*
         Requeue the original message because it
         was not safely copied to another queue.
        */
        channel.nack(
          message,
          false,
          true,
        );
      }
    }
  }

  private parseEvent(
    message: ConsumeMessage,
  ): AccountRegisteredEvent {
    const parsedJson:
      unknown =
      JSON.parse(
        message.content
          .toString(
            "utf8",
          ),
      );

    return accountRegisteredEventSchema
      .parse(
        parsedJson,
      );
  }

  private async retryOrDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    const currentRetryCount =
      getRetryCount(
        message,
      );

    if (
      currentRetryCount >=
      env.TODO_OWNER_MAX_RETRIES
    ) {
      await this.sendToDeadLetterQueue(
        channel,
        message,
        "maximum-retries-exceeded",
      );

      logger.error(
        {
          messageId:
            message.properties
              .messageId,

          retries:
            currentRetryCount,
        },
        "Owner projection event exceeded maximum retries",
      );

      return;
    }

    const nextRetryCount =
      currentRetryCount + 1;

    channel.publish(
      env.RABBITMQ_RETRY_EXCHANGE,
      ACCOUNT_REGISTERED_ROUTING_KEY,
      message.content,
      createPublishOptions(
        message,
        nextRetryCount,
      ),
    );

    await channel.waitForConfirms();

    logger.warn(
      {
        messageId:
          message.properties
            .messageId,

        retryCount:
          nextRetryCount,
      },
      "Owner projection event scheduled for retry",
    );
  }

  private async sendToDeadLetterQueue(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    reason: string,
  ): Promise<void> {
    channel.publish(
      env
        .RABBITMQ_DEAD_LETTER_EXCHANGE,
      "todo.owner-projection.failed",
      message.content,
      {
        ...createPublishOptions(
          message,
        ),

        headers: {
          ...(
            message.properties
              .headers ??
            {}
          ),

          failureReason:
            reason,
        },
      },
    );

    await channel.waitForConfirms();
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
      env.RABBITMQ_RETRY_EXCHANGE,
      "topic",
      {
        durable: true,
      },
    );

    await channel.assertExchange(
      env
        .RABBITMQ_DEAD_LETTER_EXCHANGE,
      "topic",
      {
        durable: true,
      },
    );

    await channel.assertQueue(
      env.TODO_OWNER_QUEUE,
      {
        durable: true,
      },
    );

    await channel.bindQueue(
      env.TODO_OWNER_QUEUE,
      env.RABBITMQ_EXCHANGE,
      ACCOUNT_REGISTERED_ROUTING_KEY,
    );

    await channel.assertQueue(
      env.TODO_OWNER_RETRY_QUEUE,
      {
        durable: true,

        arguments: {
          "x-message-ttl":
            env
              .TODO_OWNER_RETRY_DELAY_MS,

          "x-dead-letter-exchange":
            env.RABBITMQ_EXCHANGE,

          "x-dead-letter-routing-key":
            ACCOUNT_REGISTERED_ROUTING_KEY,
        },
      },
    );

    await channel.bindQueue(
      env.TODO_OWNER_RETRY_QUEUE,
      env.RABBITMQ_RETRY_EXCHANGE,
      ACCOUNT_REGISTERED_ROUTING_KEY,
    );

    await channel.assertQueue(
      env
        .TODO_OWNER_DEAD_LETTER_QUEUE,
      {
        durable: true,
      },
    );

    await channel.bindQueue(
      env
        .TODO_OWNER_DEAD_LETTER_QUEUE,
      env
        .RABBITMQ_DEAD_LETTER_EXCHANGE,
      "todo.owner-projection.failed",
    );
  }
}