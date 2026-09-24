import type {
  Channel,
  ConsumeMessage,
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
      Channel,

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
      .assertQueue(
        env.TODO_HISTORY_DLQ,
        {
          durable: true,
        },
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

      /*
       * Invalid or permanently failing
       * messages are sent to the configured
       * dead-letter queue.
       */
      this.channel.nack(
        message,
        false,
        false,
      );
    }
  }
}