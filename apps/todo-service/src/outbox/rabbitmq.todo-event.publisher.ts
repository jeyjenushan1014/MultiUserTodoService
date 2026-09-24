import type {
  ConfirmChannel,
} from "amqplib";

import type {
  TodoEventPublisher,
} from "./todo-event.publisher.interface.js";

import type {
  TodoOutboxEvent,
} from "./todo-outbox.types.js";

export class RabbitMqTodoEventPublisher
implements TodoEventPublisher {
  public constructor(
    private readonly channel:
      ConfirmChannel,

    private readonly exchangeName:
      string,
  ) {}

  public async initialize():
    Promise<void> {
    await this.channel
      .assertExchange(
        this.exchangeName,
        "topic",
        {
          durable:
            true,
        },
      );
  }

  public async publish(
    event:
      TodoOutboxEvent,
  ): Promise<void> {
    const serializedEvent =
      JSON.stringify(
        event.payload,
      );



    /*
     * The outbox payload already contains the
     * complete integration-event envelope.
     */
    this.channel.publish(
      this.exchangeName,
      event.eventType,
      Buffer.from(
        serializedEvent,
        "utf8",
      ),
      {
        persistent:
          true,

        contentType:
          "application/json",

        contentEncoding:
          "utf-8",

        messageId:
          event.id,

        correlationId:
          event.requestId,

        type:
          event.eventType,

        timestamp:
          Math.floor(
            event.occurredAt
              .getTime() /
              1_000,
          ),

        headers: {
          requestId:
            event.requestId,

          aggregateId:
            event.aggregateId,

          eventVersion:
            event.eventVersion,

          producer:
            "todo-service",
        },
      },
    );

    /*
     * Do not mark the outbox event as published
     * until RabbitMQ confirms receipt.
     */
    await this.channel
      .waitForConfirms();
  }
}