import type {
  ConfirmChannel,
  Options,
  Replies,
} from "amqplib";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  RabbitMqTodoEventPublisher,
} from "../rabbitmq.todo-event.publisher.js";

import type {
  TodoOutboxEvent,
} from "../todo-outbox.types.js";

type AssertExchangeMock = (
  exchange:
    string,

  exchangeType:
    string,

  options?:
    Options.AssertExchange,
) => Promise<
  Replies.AssertExchange
>;

type PublishMock = (
  exchange:
    string,

  routingKey:
    string,

  content:
    Buffer,

  options?:
    Options.Publish,
) => boolean;

type WaitForConfirmsMock =
  () => Promise<void>;

interface PublisherFixture {
  readonly publisher:
    RabbitMqTodoEventPublisher;

  readonly assertExchangeMock:
    ReturnType<
      typeof vi.fn<
        AssertExchangeMock
      >
    >;

  readonly publishMock:
    ReturnType<
      typeof vi.fn<
        PublishMock
      >
    >;

  readonly waitForConfirmsMock:
    ReturnType<
      typeof vi.fn<
        WaitForConfirmsMock
      >
    >;
}

const eventPayload = {
  eventId:
    "f0c8fdcf-bf84-4d17-a7fd-5ab7349d987c",

  eventType:
    "todo.deleted",

  eventVersion:
    1,

  producer:
    "todo-service",

  requestId:
    "224d07f1-8812-429c-a0a6-092d83977ad5",

  occurredAt:
    "2026-09-24T13:00:00.000Z",

  payload: {
    todoId:
      "9f134ed0-4503-4a23-a189-f065fe9fd838",

    ownerId:
      "70668eae-dac5-4b75-9bd3-02c963eb5b99",

    deletedByUserId:
      "70668eae-dac5-4b75-9bd3-02c963eb5b99",
  },
};

const outboxEvent:
  TodoOutboxEvent = {
    id:
      "f0c8fdcf-bf84-4d17-a7fd-5ab7349d987c",

    aggregateId:
      "9f134ed0-4503-4a23-a189-f065fe9fd838",

    eventType:
      "todo.deleted",

    eventVersion:
      1,

    payload:
      eventPayload,

    requestId:
      "224d07f1-8812-429c-a0a6-092d83977ad5",

    occurredAt:
      new Date(
        "2026-09-24T13:00:00.000Z",
      ),

    publishAttempts:
      1,
  };

function createFixture():
  PublisherFixture {
  const assertExchangeMock =
    vi.fn<
      AssertExchangeMock
    >();

  const publishMock =
    vi.fn<
      PublishMock
    >();

  const waitForConfirmsMock =
    vi.fn<
      WaitForConfirmsMock
    >();

  const channel = {
    assertExchange:
      assertExchangeMock,

    publish:
      publishMock,

    waitForConfirms:
      waitForConfirmsMock,
  } as unknown as ConfirmChannel;

  return {
    publisher:
      new RabbitMqTodoEventPublisher(
        channel,
        "todo.events",
      ),

    assertExchangeMock,
    publishMock,
    waitForConfirmsMock,
  };
}

describe(
  "RabbitMqTodoEventPublisher",
  () => {
    it(
      "declares a durable topic exchange",
      async () => {
        const fixture =
          createFixture();

        fixture
          .assertExchangeMock
          .mockResolvedValueOnce({
            exchange:
              "todo.events",
          });

        await fixture.publisher
          .initialize();

        expect(
          fixture
            .assertExchangeMock,
        ).toHaveBeenCalledWith(
          "todo.events",
          "topic",
          {
            durable:
              true,
          },
        );
      },
    );

    it(
      "publishes a persistent event using its event type as the routing key",
      async () => {
        const fixture =
          createFixture();

        fixture
          .publishMock
          .mockReturnValueOnce(
            true,
          );

        fixture
          .waitForConfirmsMock
          .mockResolvedValueOnce(
            undefined,
          );

        await fixture.publisher
          .publish(
            outboxEvent,
          );

        expect(
          fixture.publishMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const publishCall =
          fixture
            .publishMock
            .mock
            .calls[0];

        if (
          publishCall ===
          undefined
        ) {
          throw new Error(
            "Expected RabbitMQ publish to be called",
          );
        }

        expect(
          publishCall[0],
        ).toBe(
          "todo.events",
        );

        expect(
          publishCall[1],
        ).toBe(
          "todo.deleted",
        );

        expect(
          publishCall[2]
            .toString(
              "utf8",
            ),
        ).toBe(
          JSON.stringify(
            eventPayload,
          ),
        );

        expect(
          publishCall[3],
        ).toEqual(
          expect.objectContaining({
            persistent:
              true,

            contentType:
              "application/json",

            messageId:
              outboxEvent.id,

            correlationId:
              outboxEvent.requestId,

            type:
              "todo.deleted",
          }),
        );

        expect(
          fixture
            .waitForConfirmsMock,
        ).toHaveBeenCalledOnce();
      },
    );

    it(
      "propagates RabbitMQ publisher-confirm failures",
      async () => {
        const fixture =
          createFixture();

        fixture
          .publishMock
          .mockReturnValueOnce(
            true,
          );

        fixture
          .waitForConfirmsMock
          .mockRejectedValueOnce(
            new Error(
              "RabbitMQ confirmation failed",
            ),
          );

        await expect(
          fixture.publisher
            .publish(
              outboxEvent,
            ),
        ).rejects.toThrow(
          "RabbitMQ confirmation failed",
        );
      },
    );
  },
);