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
  accountEmailChangedEventSchema,
} from "./account-event.schema.js";

// event types are validated via zod schemas; no direct imports needed here

import type {
  OwnerProjectionService,
} from "./owner-projection.service.js";

import type {
  AccountRegisteredEvent,
  AccountEmailChangedEvent,
} from "./account-event.schema.js";

const ACCOUNT_REGISTERED_ROUTING_KEY =
  "account.registered";

const ACCOUNT_EMAIL_CHANGED_ROUTING_KEY =
  "account.email-changed";

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

function safeStringify(value: unknown): string {
  try {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "<unstringifiable>";
    }
  }
}

export class AccountEventConsumer {
  private connection:
    ChannelModel | undefined;

  private channel:
    ConfirmChannel | undefined;

  private connectionClosed:
    Promise<void> | undefined;

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

    this.connectionClosed =
      new Promise<void>(
        (resolve) => {
          connection.once(
            "close",
            resolve,
          );
        },
      );

    const channel =
      await connection
        .createConfirmChannel();

    connection.on(
      "error",
      (error: Error) => {
        logger.error(
          {
            errMessage: safeStringify(error),
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
            errMessage: safeStringify(error),
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
            errMessage: String(error),
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
            errMessage: String(error),
          },
          "TODO owner consumer connection close failed",
        );
      }
    }
  }

  public async waitForConnectionClose():
  Promise<void> {
    const connectionClosed =
      this.connectionClosed;

    if (connectionClosed !== undefined) {
      await connectionClosed;
    }
  }

  private async handleMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      const parsedJson =
        JSON.parse(message.content.toString("utf8")) as unknown;

      let eventType: string | undefined = undefined;

      if (typeof parsedJson === "object" && parsedJson !== null) {
        const p = parsedJson as Record<string, unknown>;
        const ev = p.eventType;

        if (typeof ev === "string") {
          eventType = ev;
        }
      }

      if (eventType === "account.registered") {
        const event: AccountRegisteredEvent =
          accountRegisteredEventSchema.parse(parsedJson);

        await this.service.handleAccountRegistered(event);
        channel.ack(message);
        return;
      }

      if (eventType === "account.email-changed") {
        const event: AccountEmailChangedEvent =
          accountEmailChangedEventSchema.parse(parsedJson);

        await this.service.handleAccountEmailChanged(event);
        channel.ack(message);
        return;
      }

      throw new Error("Unsupported account event type for owner projection");
    } catch (err) {
      if (
        err instanceof ZodError ||
        err instanceof SyntaxError
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
            errMessage: safeStringify(err),

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
      } catch (retryPublicationError) {
        logger.error(
          {
            errMessage: safeStringify(retryPublicationError),

            processingErrorMessage:
              safeStringify(err),

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

  // parseEvent() removed — message parsing and dispatch happens in handleMessage

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

    let routingKey = ACCOUNT_REGISTERED_ROUTING_KEY;

    try {
      const parsed: unknown = JSON.parse(
        message.content.toString("utf8"),
      );

      if (typeof parsed === "object" && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        const ev = p.eventType;

        if (typeof ev === "string") {
          routingKey = ev;
        }
      }
    } catch {
      // keep default routing key
    }

    channel.publish(
      env.RABBITMQ_RETRY_EXCHANGE,
      routingKey,
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

    await channel.bindQueue(
      env.TODO_OWNER_QUEUE,
      env.RABBITMQ_EXCHANGE,
      ACCOUNT_EMAIL_CHANGED_ROUTING_KEY,
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

    await channel.bindQueue(
      env.TODO_OWNER_RETRY_QUEUE,
      env.RABBITMQ_RETRY_EXCHANGE,
      ACCOUNT_EMAIL_CHANGED_ROUTING_KEY,
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
