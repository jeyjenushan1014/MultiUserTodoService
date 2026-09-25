import type {
  ConfirmChannel,
  ConsumeMessage,
  Options,
} from "amqplib";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import type {
  TodoHistoryRepository,
} from "./todo-history.interface.js";

import {
  TODO_HISTORY_EVENT_TYPES,
} from "./todo-history.types.js";

type HistoryEventType =
  (typeof TODO_HISTORY_EVENT_TYPES)[number];

interface HistoryEvent {
  readonly eventId: string;
  readonly eventType: HistoryEventType;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

const HISTORY_RETRY_COUNT_HEADER =
  "x-todo-history-retry-count";

function getRetryCount(
  message: ConsumeMessage,
): number {
  const value =
    message.properties.headers?.[
      HISTORY_RETRY_COUNT_HEADER
    ];

  return typeof value === "number"
    ? value
    : 0;
}

function createPublishOptions(
  message: ConsumeMessage,
  retryCount?: number,
): Options.Publish {
  const headers =
    message.properties.headers ?? {};

  return {
    persistent: true,
    contentType:
      message.properties.contentType ??
      "application/json",
    ...(message.properties.messageId === undefined
      ? {}
      : {
          messageId:
            message.properties.messageId,
        }),
    headers:
      retryCount === undefined
        ? headers
        : {
            ...headers,
            [HISTORY_RETRY_COUNT_HEADER]:
              retryCount,
          },
  };
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function getString(
  value: Record<string, unknown>,
  field: string,
): string {
  const fieldValue =
    value[field];

  if (
    typeof fieldValue !== "string"
  ) {
    throw new Error(
      `Missing event field: ${field}`,
    );
  }

  return fieldValue;
}

function parseHistoryEvent(
  value: unknown,
): HistoryEvent {
  if (!isRecord(value)) {
    throw new Error(
      "TODO history event must be an object",
    );
  }

  const eventType =
    getString(
      value,
      "eventType",
    );

  if (
    !TODO_HISTORY_EVENT_TYPES.includes(
      eventType as HistoryEventType,
    )
  ) {
    throw new Error(
      "Unsupported TODO history event type",
    );
  }

  const payload =
    value.payload;

  if (!isRecord(payload)) {
    throw new Error(
      "TODO history event payload is invalid",
    );
  }

  return {
    eventId:
      getString(
        value,
        "eventId",
      ),

    eventType:
      eventType as HistoryEventType,

    requestId:
      getString(
        value,
        "requestId",
      ),

    occurredAt:
      getString(
        value,
        "occurredAt",
      ),

    payload,
  };
}

function getActorId(
  event: HistoryEvent,
): string {
  if (
    event.eventType ===
    "todo.completed"
  ) {
    return getString(
      event.payload,
      "completedByUserId",
    );
  }

  if (
    event.eventType ===
    "todo.deleted"
  ) {
    return getString(
      event.payload,
      "deletedByUserId",
    );
  }

  return getString(
    event.payload,
    "ownerId",
  );
}

function getOccurredAt(
  event: HistoryEvent,
): Date {
  const occurredAt =
    new Date(
      event.occurredAt,
    );

  if (
    Number.isNaN(
      occurredAt.getTime(),
    )
  ) {
    throw new Error(
      "TODO history event timestamp is invalid",
    );
  }

  return occurredAt;
}

export class TodoHistoryConsumer {
  public constructor(
    private readonly channel:
      ConfirmChannel,

    private readonly repository:
      TodoHistoryRepository,
  ) {}

  public async initialize():
  Promise<void> {
    await this.channel
      .assertExchange(
        env.RABBITMQ_EXCHANGE,
        "topic",
        {
          durable: true,
        },
      );

    await this.channel
      .assertExchange(
        env.RABBITMQ_RETRY_EXCHANGE,
        "topic",
        {
          durable: true,
        },
      );

    await this.channel
      .assertExchange(
        env.RABBITMQ_DEAD_LETTER_EXCHANGE,
        "topic",
        {
          durable: true,
        },
      );

    await this.channel
      .assertQueue(
        env.TODO_HISTORY_DLQ,
        {
          durable: true,
        },
      );

    await this.channel
      .bindQueue(
        env.TODO_HISTORY_DLQ,
        env.RABBITMQ_DEAD_LETTER_EXCHANGE,
        env.TODO_HISTORY_DLQ,
      );

    await this.channel
      .assertQueue(
        env.TODO_HISTORY_RETRY_QUEUE,
        {
          durable: true,
          arguments: {
            "x-message-ttl":
              env.TODO_HISTORY_RETRY_DELAY_MS,
            "x-dead-letter-exchange":
              env.RABBITMQ_EXCHANGE,
          },
        },
      );

    await this.channel
      .bindQueue(
        env.TODO_HISTORY_RETRY_QUEUE,
        env.RABBITMQ_RETRY_EXCHANGE,
        "#",
      );

    await this.channel
      .assertQueue(
        env.TODO_HISTORY_QUEUE,
        {
          durable: true,

          deadLetterExchange:
            env.RABBITMQ_DEAD_LETTER_EXCHANGE,

          deadLetterRoutingKey:
            env.TODO_HISTORY_DLQ,
        },
      );

    for (
      const eventType of
        TODO_HISTORY_EVENT_TYPES
    ) {
      await this.channel
        .bindQueue(
          env.TODO_HISTORY_QUEUE,
          env.RABBITMQ_EXCHANGE,
          eventType,
        );
    }
  }

  public async start():
  Promise<void> {
    await this.channel
      .consume(
        env.TODO_HISTORY_QUEUE,
        (
          message:
            ConsumeMessage | null,
        ): void => {
          if (message !== null) {
            void this.process(
              message,
            );
          }
        },
      );
  }

  private async process(
    message: ConsumeMessage,
  ): Promise<void> {
    let appendStarted = false;

    try {
      const parsedEvent =
        JSON.parse(
          message.content.toString(
            "utf8",
          ),
        ) as unknown;

      const event =
        parseHistoryEvent(
          parsedEvent,
        );

      const todoId =
        getString(
          event.payload,
          "todoId",
        );

      appendStarted = true;

      await this.repository
        .append({
          eventId:
            event.eventId,

          todoId,

          actorId:
            getActorId(
              event,
            ),

          eventType:
            event.eventType,

          requestId:
            event.requestId,

          occurredAt:
            getOccurredAt(
              event,
            ),

          details:
            event.payload,
        });

      /*
       * The repository uses
       * ON CONFLICT (event_id) DO NOTHING.
       * Therefore duplicate events are
       * acknowledged safely.
       */
      this.channel.ack(
        message,
      );
    } catch (error) {
      logger.error(
        {
          error,
        },
        "TODO history event processing failed",
      );

      if (!appendStarted) {
        try {
          await this.sendToDeadLetterQueue(
            message,
            "invalid-message",
          );
          this.channel.ack(message);
        } catch (publicationError) {
          logger.error(
            {
              error: publicationError,
            },
            "TODO history dead-letter publication failed",
          );
          this.channel.nack(
            message,
            false,
            true,
          );
        }
        return;
      }

      try {
        await this.retryOrDeadLetter(
          message,
        );
        this.channel.ack(message);
      } catch (publicationError) {
        logger.error(
          {
            error: publicationError,
          },
          "TODO history retry publication failed",
        );
        this.channel.nack(
          message,
          false,
          true,
        );
      }
    }
  }

  private async retryOrDeadLetter(
    message: ConsumeMessage,
  ): Promise<void> {
    const retryCount =
      getRetryCount(message);

    if (
      retryCount >=
      env.TODO_HISTORY_MAX_RETRIES
    ) {
      await this.sendToDeadLetterQueue(
        message,
        "maximum-retries-exceeded",
      );
      return;
    }

    const routingKey =
      message.fields.routingKey ||
      this.getEventType(message);

    this.channel.publish(
      env.RABBITMQ_RETRY_EXCHANGE,
      routingKey,
      message.content,
      createPublishOptions(
        message,
        retryCount + 1,
      ),
    );

    await this.channel.waitForConfirms();
  }

  private async sendToDeadLetterQueue(
    message: ConsumeMessage,
    reason: string,
  ): Promise<void> {
    this.channel.publish(
      env.RABBITMQ_DEAD_LETTER_EXCHANGE,
      env.TODO_HISTORY_DLQ,
      message.content,
      {
        ...createPublishOptions(message),
        headers: {
          ...(message.properties.headers ?? {}),
          failureReason: reason,
        },
      },
    );

    await this.channel.waitForConfirms();
  }

  private getEventType(
    message: ConsumeMessage,
  ): string {
    const parsed = JSON.parse(
      message.content.toString("utf8"),
    ) as Record<string, unknown>;

    if (typeof parsed.eventType !== "string") {
      throw new Error(
        "History event type is unavailable",
      );
    }

    return parsed.eventType;
  }
}