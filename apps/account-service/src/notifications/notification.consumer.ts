import type {
  Channel,
  ConsumeMessage,
} from "amqplib";

import {
  z,
} from "zod";

import type {
  AccountPasswordResetRequestedPayload,
  TodoShareWithdrawnPayload,
  TodoSharedPayload,
} from "@todo/contracts";

import {
  database,
} from "../config/database.js";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import type {
  NotificationMailer,
} from "./notification.mailer.js";

import type {
  NotificationDeliveryRepository,
} from "./notification-delivery.repository.interface.js";

import {
  PostgresNotificationDeliveryRepository,
} from "./postgres-notification-delivery.repository.js";

import {
  decryptPasswordResetToken,
} from "../modules/account/password-reset/password-reset-token.crypto.js";

const todoSharedNotificationSchema =
  z.object({
    eventId: z.uuid(),
    eventType: z.literal("todo.shared"),
    eventVersion: z.number().int(),
    producer: z.literal("todo-service"),
    requestId: z.uuid(),
    occurredAt: z.string(),
    payload: z.object({
      shareId: z.uuid(),
      todoId: z.uuid(),
      ownerId: z.uuid(),
      recipientId: z.uuid(),
    }) satisfies z.ZodType<TodoSharedPayload>,
  });

const todoShareWithdrawnNotificationSchema =
  z.object({
    eventId: z.uuid(),
    eventType: z.literal("todo.share-withdrawn"),
    eventVersion: z.number().int(),
    producer: z.literal("todo-service"),
    requestId: z.uuid(),
    occurredAt: z.string(),
    payload: z.object({
      shareId: z.uuid(),
      todoId: z.uuid(),
      ownerId: z.uuid(),
      recipientId: z.uuid(),
    }) satisfies z.ZodType<TodoShareWithdrawnPayload>,
  });

const passwordResetRequestedNotificationSchema =
  z.object({
    eventId: z.uuid(),
    eventType: z.literal("account.password-reset-requested"),
    eventVersion: z.number().int(),
    producer: z.literal("account-service"),
    requestId: z.uuid(),
    occurredAt: z.string(),
    payload: z.object({
      userId: z.uuid(),
      email: z.email(),
      encryptedResetToken: z.string().min(1),
      expiresAt: z.string(),
    }) satisfies z.ZodType<AccountPasswordResetRequestedPayload>,
  });

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
    private readonly deliveryRepository:
      NotificationDeliveryRepository =
        new PostgresNotificationDeliveryRepository(),
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

    await this.channel.bindQueue(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      env.RABBITMQ_EXCHANGE,
      "account.password-reset-requested",
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
        await this.deliver(
          message,
          shared.data.eventId,
          async () => {
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
          },
        );
        return;
      }

      const withdrawn =
        todoShareWithdrawnNotificationSchema.safeParse(
          event,
        );

      if (withdrawn.success) {
        await this.deliver(
          message,
          withdrawn.data.eventId,
          async () => {
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
          },
        );
        return;
      }

      const passwordResetRequested =
        passwordResetRequestedNotificationSchema.safeParse(
          event,
        );

      if (!passwordResetRequested.success) {
        throw new Error(
          "Invalid notification event",
        );
      }

      await this.deliver(
        message,
        passwordResetRequested.data.eventId,
        async () => {
          await this.mailer.sendPasswordResetEmail(
            passwordResetRequested.data.payload.email,
            decryptPasswordResetToken(
              passwordResetRequested.data.payload
                .encryptedResetToken,
            ),
            passwordResetRequested.data.payload.expiresAt,
          );
        },
      );
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

  private async deliver(
    message: ConsumeMessage,
    eventId: string,
    send: () => Promise<void>,
  ): Promise<void> {
    const claim =
      await this.deliveryRepository.claim(eventId);

    if (claim.status === "completed") {
      this.channel.ack(message);
      return;
    }

    if (
      claim.status === "in-progress"
      || claim.processingToken === undefined
    ) {
      this.channel.nack(message, false, false);
      return;
    }

    try {
      await send();
      await this.deliveryRepository.markSent(
        eventId,
        claim.processingToken,
      );
      this.channel.ack(message);
    } catch (error) {
      await this.deliveryRepository.markFailed(
        eventId,
        claim.processingToken,
        error instanceof Error
          ? error.message
          : String(error),
      );
      throw error;
    }
  }
}