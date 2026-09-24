import type {
  Channel,
  ConsumeMessage,
} from "amqplib";

import {
  database,
} from "../config/database.js";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  todoSharedNotificationSchema,
  todoShareWithdrawnNotificationSchema,
} from "./notification.types.js";

import type {
  NotificationMailer,
} from "./notification.mailer.js";

function parseMessage(
  message: ConsumeMessage,
): unknown {
  return JSON.parse(
    message.content.toString("utf8"),
  ) as unknown;
}

async function findAccountEmail(
  accountId: string,
): Promise<string | undefined> {
  const result =
    await database.query<{
      readonly email: string;
    }>(
      `
        SELECT email
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [accountId],
    );

  return result.rows[0]?.email;
}

export class TodoNotificationConsumer {
  public constructor(
    private readonly channel: Channel,
    private readonly mailer: NotificationMailer,
  ) {}

  public async initialize(): Promise<void> {
    await this.channel.assertExchange(
      env.RABBITMQ_EXCHANGE,
      "topic",
      {
        durable: true,
      },
    );

    await this.channel.assertExchange(
      env.RABBITMQ_DEAD_LETTER_EXCHANGE,
      "topic",
      {
        durable: true,
      },
    );

    await this.channel.assertQueue(
      env.RABBITMQ_NOTIFICATION_DLQ,
      {
        durable: true,
      },
    );

    await this.channel.bindQueue(
      env.RABBITMQ_NOTIFICATION_DLQ,
      env.RABBITMQ_DEAD_LETTER_EXCHANGE,
      env.RABBITMQ_NOTIFICATION_DLQ_ROUTING_KEY,
    );

    await this.channel.assertQueue(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      {
        durable: true,
        deadLetterExchange:
          env.RABBITMQ_DEAD_LETTER_EXCHANGE,
        deadLetterRoutingKey:
          env.RABBITMQ_NOTIFICATION_DLQ_ROUTING_KEY,
      },
    );

    await this.channel.bindQueue(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      env.RABBITMQ_EXCHANGE,
      "todo.shared",
    );

    await this.channel.bindQueue(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      env.RABBITMQ_EXCHANGE,
      "todo.share-withdrawn",
    );
  }

  public async start(): Promise<void> {
    await this.channel.consume(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      (message) => {
        if (message === null) {
          return;
        }

        void this.process(message);
      },
    );
  }

  private async process(
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      const event =
        parseMessage(message);

      const shared =
        todoSharedNotificationSchema.safeParse(
          event,
        );

      if (shared.success) {
        const recipientEmail =
          await findAccountEmail(
            shared.data.payload.recipientId,
          );

        if (recipientEmail !== undefined) {
          await this.mailer.sendTodoSharedEmail(
            recipientEmail,
            shared.data.payload.todoId,
          );
        }

        this.channel.ack(message);
        return;
      }

      const withdrawn =
        todoShareWithdrawnNotificationSchema.safeParse(
          event,
        );

      if (!withdrawn.success) {
        throw new Error(
          "Invalid TODO notification event",
        );
      }

      const recipientEmail =
        await findAccountEmail(
          withdrawn.data.payload.recipientId,
        );

      if (recipientEmail !== undefined) {
        await this.mailer.sendTodoShareWithdrawnEmail(
          recipientEmail,
          withdrawn.data.payload.todoId,
        );
      }

      this.channel.ack(message);
    } catch (error) {
      logger.error(
        {
          error,
        },
        "TODO notification processing failed",
      );

      this.channel.nack(
        message,
        false,
        false,
      );
    }
  }
}