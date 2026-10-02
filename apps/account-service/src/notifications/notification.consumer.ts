import type {
  ConfirmChannel,
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

import {
  runWithRequestContext,
} from "@todo/common";

const rawEventRequestIdSchema =
  z.object({
    requestId: z.uuid(),
  });

const maxDeliveryAttempts = 3;
const retryDelaysMilliseconds = [env.MAIL_RETRY_FIRST_MS, env.MAIL_RETRY_SECOND_MS] as const;

class InvalidNotificationEventError extends Error {}
class NotificationQuotaExceededError extends Error {}

function deliveryAttempt(message: ConsumeMessage): number | undefined {
  const rawAttempt: unknown = message.properties.headers?.["x-notification-attempt"];
  const attempt = rawAttempt ?? 1;
  return typeof attempt === "number" && Number.isInteger(attempt)
    && attempt >= 1 && attempt <= maxDeliveryAttempts
    ? attempt
    : undefined;
}

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

export class TodoNotificationConsumer {
  public constructor(
    private readonly channel: ConfirmChannel,
    private readonly mailer: NotificationMailer,
    private readonly deliveryRepository:
      NotificationDeliveryRepository =
        new PostgresNotificationDeliveryRepository(),
    private readonly selectMailer?: (eventId: string) => Promise<NotificationMailer>,
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

    await this.channel.assertQueue(
      `${env.RABBITMQ_NOTIFICATION_QUEUE}.retry`,
      {
        durable: true,
        deadLetterExchange: env.RABBITMQ_EXCHANGE,
        deadLetterRoutingKey: "notification.retry",
      },
    );

    await this.channel.bindQueue(
      env.RABBITMQ_NOTIFICATION_QUEUE,
      env.RABBITMQ_EXCHANGE,
      "notification.retry",
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
    let event: unknown;

    try {
      event = parseMessage(message);
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
      return;
    }

    const requestId =
      rawEventRequestIdSchema.safeParse(event).data
        ?.requestId;

    await runWithRequestContext(
      {
        requestId:
          requestId ?? "unknown",
        serviceName: "account-service",
      },
      () => this.processEvent(message, event),
    );
  }

  private async processEvent(
    message: ConsumeMessage,
    event: unknown,
  ): Promise<void> {
    try {
      if (deliveryAttempt(message) === undefined) {
        this.channel.nack(message, false, false);
        return;
      }

      const shared =
        todoSharedNotificationSchema.safeParse(
          event,
        );

      if (shared.success) {
        await this.deliver(
          message,
          shared.data.eventId,
          async (selectedMailer) => this.deliveryRepository.withRecipientGuard(
            shared.data.payload.recipientId,
            async (session) => {
            const recipientEmail =
              await session.findEmail(
                shared.data.payload.recipientId,
              );

            if (recipientEmail !== undefined) {
              if (!await session.reserveAddress(
                shared.data.eventId, shared.data.payload.recipientId, recipientEmail,
              )) {
                throw new NotificationQuotaExceededError();
              }
              await selectedMailer.sendTodoSharedEmail(
                recipientEmail,
                shared.data.payload.todoId,
              );
            }
          }),
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
          async (selectedMailer) => this.deliveryRepository.withRecipientGuard(
            withdrawn.data.payload.recipientId,
            async (session) => {
            const recipientEmail =
              await session.findEmail(
                withdrawn.data.payload.recipientId,
              );

            if (recipientEmail !== undefined) {
              if (!await session.reserveAddress(
                withdrawn.data.eventId, withdrawn.data.payload.recipientId, recipientEmail,
              )) {
                throw new NotificationQuotaExceededError();
              }
              await selectedMailer.sendTodoShareWithdrawnEmail(
                recipientEmail,
                withdrawn.data.payload.todoId,
              );
            }
          }),
        );
        return;
      }

      const passwordResetRequested =
        passwordResetRequestedNotificationSchema.safeParse(
          event,
        );

      if (!passwordResetRequested.success) {
        throw new InvalidNotificationEventError(
          "Invalid notification event",
        );
      }

      await this.deliver(
        message,
        passwordResetRequested.data.eventId,
        async (selectedMailer) => this.deliveryRepository.withRecipientGuard(
          passwordResetRequested.data.payload.userId,
          async (session) => {
          const accountEmail = await session.findEmail(passwordResetRequested.data.payload.userId);
          if (accountEmail === passwordResetRequested.data.payload.email) {
            if (!await session.reserveAddress(
              passwordResetRequested.data.eventId, passwordResetRequested.data.payload.userId,
              accountEmail,
            )) {
              throw new NotificationQuotaExceededError();
            }
            await selectedMailer.sendPasswordResetEmail(
              accountEmail,
              decryptPasswordResetToken(
                passwordResetRequested.data.payload.encryptedResetToken,
              ),
              passwordResetRequested.data.payload.expiresAt,
            );
          }
        }),
      );
    } catch (error) {
      logger.error(
        {
          failure: "notification-processing",
        },
        "TODO notification processing failed",
      );

      this.channel.nack(
        message,
        false,
        !(error instanceof InvalidNotificationEventError),
      );
    }
  }

  private async scheduleRetry(
    message: ConsumeMessage,
    attempt: number,
    nextAttempt = attempt + 1,
  ): Promise<void> {
    const delay = retryDelaysMilliseconds[attempt - 1]
      ?? retryDelaysMilliseconds[0];
    if (nextAttempt > maxDeliveryAttempts) {
      this.channel.nack(message, false, false);
      return;
    }

    this.channel.sendToQueue(
      `${env.RABBITMQ_NOTIFICATION_QUEUE}.retry`,
      message.content,
      {
        persistent: true,
        expiration: String(delay),
        headers: { "x-notification-attempt": nextAttempt },
      },
    );
    await this.channel.waitForConfirms();
    this.channel.ack(message);
  }

  private async finishDeadLetter(message: ConsumeMessage, eventId: string): Promise<void> {
    this.channel.sendToQueue(
      env.RABBITMQ_NOTIFICATION_DLQ,
      message.content,
      {
        persistent: true,
        headers: { "x-notification-attempt": maxDeliveryAttempts },
      },
    );
    await this.channel.waitForConfirms();
    await this.deliveryRepository.markDeadLetter(eventId);
    this.channel.ack(message);
  }

  private async deliver(
    message: ConsumeMessage,
    eventId: string,
    send: (mailer: NotificationMailer) => Promise<void>,
  ): Promise<void> {
    const attempt = deliveryAttempt(message);
    if (attempt === undefined) {
      this.channel.nack(message, false, false);
      return;
    }

    const claim =
      await this.deliveryRepository.claim(eventId, attempt);

    if (claim.status === "completed" || claim.status === "stale") {
      this.channel.ack(message);
      return;
    }

    if (claim.status === "retry-pending") {
      await this.scheduleRetry(message, attempt);
      return;
    }

    if (claim.status === "dead-letter-pending") {
      await this.finishDeadLetter(message, eventId);
      return;
    }

    if (
      claim.status === "in-progress"
      || claim.processingToken === undefined
    ) {
      await this.scheduleRetry(message, attempt, attempt);
      return;
    }

    try {
      const selectedMailer = this.selectMailer === undefined
        ? this.mailer
        : await this.selectMailer(eventId);
      await send(selectedMailer);
      await this.deliveryRepository.markSent(
        eventId,
        claim.processingToken,
      );
      this.channel.ack(message);
    } catch (error) {
      const overQuota = error instanceof NotificationQuotaExceededError;
      await this.deliveryRepository.markFailed(
        eventId,
        claim.processingToken,
        overQuota ? "Recipient mail quota exceeded" : "Notification transport failed",
        overQuota || attempt === maxDeliveryAttempts,
      );
      if (overQuota || attempt === maxDeliveryAttempts) {
        await this.finishDeadLetter(message, eventId);
      } else {
        await this.scheduleRetry(message, attempt);
      }
    }
  }
}