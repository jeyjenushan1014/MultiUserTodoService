import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  Channel,
  ConsumeMessage,
} from "amqplib";

import type {
  TodoHistoryRepository,
} from "../todo-history.interface.js";

import {
  TodoHistoryConsumer,
} from "../todo-history.consumer.js";

function createMessage(
  value:
    unknown,
): ConsumeMessage {
  return {
    content:
      Buffer.from(
        JSON.stringify(value),
      ),

    fields:
      {} as ConsumeMessage["fields"],

    properties:
      {} as ConsumeMessage["properties"],
  };
}

const validEvent = {
  eventId:
    "11111111-1111-4111-8111-111111111111",

  eventType:
    "todo.created",

  requestId:
    "22222222-2222-4222-8222-222222222222",

  occurredAt:
    "2026-09-24T10:00:00.000Z",

  payload: {
    todoId:
      "33333333-3333-4333-8333-333333333333",

    ownerId:
      "44444444-4444-4444-8444-444444444444",
  },
};

interface ConsumerDependencies {
  readonly consumer:
    TodoHistoryConsumer;

  readonly consumeMock:
    ReturnType<typeof vi.fn>;

  readonly ackMock:
    ReturnType<typeof vi.fn>;

  readonly nackMock:
    ReturnType<typeof vi.fn>;

  readonly appendMock:
    ReturnType<typeof vi.fn>;
}

function createDependencies():
ConsumerDependencies {
  const ackMock =
    vi.fn();

  const nackMock =
    vi.fn();

  const consumeMock =
    vi.fn();

  const appendMock =
    vi.fn()
      .mockResolvedValue(true);

  const channel =
    {
      ack:
        ackMock,

      nack:
        nackMock,

      consume:
        consumeMock,

      assertExchange:
        vi.fn()
          .mockResolvedValue(undefined),

      assertQueue:
        vi.fn()
          .mockResolvedValue(undefined),

      bindQueue:
        vi.fn()
          .mockResolvedValue(undefined),
    } as unknown as Channel;

  const repository:
    TodoHistoryRepository = {
      append:
        appendMock,

      listAccessible:
        vi.fn()
          .mockResolvedValue([]),
    };

  return {
    consumer:
      new TodoHistoryConsumer(
        channel,
        repository,
      ),

    consumeMock,
    ackMock,
    nackMock,
    appendMock,
  };
}

describe(
  "TodoHistoryConsumer failure handling",
  () => {
    it(
      "acknowledges a valid history event",
      async () => {
        const dependencies =
          createDependencies();

        await dependencies.consumer
          .start();

        const callback =
          dependencies.consumeMock
            .mock.calls[0]?.[1] as
            (
              message:
                ConsumeMessage | null,
            ) => void;

        callback(
          createMessage(
            validEvent,
          ),
        );

        await new Promise<void>(
          (resolve) => {
            setImmediate(resolve);
          },
        );

        expect(
          dependencies.appendMock,
        ).toHaveBeenCalledOnce();

        expect(
          dependencies.ackMock,
        ).toHaveBeenCalledOnce();

        expect(
          dependencies.nackMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "dead-letters an invalid event",
      async () => {
        const dependencies =
          createDependencies();

        await dependencies.consumer
          .start();

        const callback =
          dependencies.consumeMock
            .mock.calls[0]?.[1] as
            (
              message:
                ConsumeMessage | null,
            ) => void;

        callback(
          createMessage({
            eventType:
              "unsupported.event",
          }),
        );

        await new Promise<void>(
          (resolve) => {
            setImmediate(resolve);
          },
        );

        expect(
          dependencies.appendMock,
        ).not.toHaveBeenCalled();

        expect(
          dependencies.nackMock,
        ).toHaveBeenCalledWith(
          expect.anything(),
          false,
          false,
        );

        expect(
          dependencies.ackMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);