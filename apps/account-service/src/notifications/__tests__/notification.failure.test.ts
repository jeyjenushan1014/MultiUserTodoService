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
  NotificationMailer,
} from "../notification.mailer.js";

import type {
  NotificationDeliveryRepository,
} from "../notification-delivery.repository.interface.js";

import {
  TodoNotificationConsumer,
} from "../notification.consumer.js";

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

function createDeliveryRepository(): NotificationDeliveryRepository {
  return {
    claim:
      vi.fn().mockResolvedValue({
        status: "claimed",
        processingToken: "processing-token",
      }),
    markSent:
      vi.fn().mockResolvedValue(undefined),
    markFailed:
      vi.fn().mockResolvedValue(undefined),
  };
}

describe(
  "TodoNotificationConsumer failure handling",
  () => {
    it(
      "dead-letters an invalid notification event",
      async () => {
        const consumeMock =
          vi.fn();

        const ackMock =
          vi.fn();

        const nackMock =
          vi.fn();

        const channel =
          {
            consume:
              consumeMock,

            ack:
              ackMock,

            nack:
              nackMock,
          } as unknown as Channel;

        const mailer:
          NotificationMailer = {
            sendTodoSharedEmail:
              vi.fn()
                .mockResolvedValue(undefined),

            sendTodoShareWithdrawnEmail:
              vi.fn()
                .mockResolvedValue(undefined),

            sendPasswordResetEmail:
              vi.fn()
                .mockResolvedValue(undefined),
          };

        const consumer =
          new TodoNotificationConsumer(
            channel,
            mailer,
            createDeliveryRepository(),
          );

        await consumer.start();

        const callback =
          consumeMock
            .mock.calls[0]?.[1] as
            (
              message:
                ConsumeMessage | null,
            ) => void;

        callback(
          createMessage({
            eventType:
              "invalid.notification",
          }),
        );

        await new Promise<void>(
          (resolve) => {
            setImmediate(resolve);
          },
        );

        expect(
          ackMock,
        ).not.toHaveBeenCalled();

        expect(
          nackMock,
        ).toHaveBeenCalledWith(
          expect.anything(),
          false,
          false,
        );
      },
    );

    it(
      "dead-letters malformed JSON",
      async () => {
        const consumeMock =
          vi.fn();

        const ackMock =
          vi.fn();

        const nackMock =
          vi.fn();

        const channel =
          {
            consume:
              consumeMock,

            ack:
              ackMock,

            nack:
              nackMock,
          } as unknown as Channel;

        const mailer:
          NotificationMailer = {
            sendTodoSharedEmail:
              vi.fn()
                .mockResolvedValue(undefined),

            sendTodoShareWithdrawnEmail:
              vi.fn()
                .mockResolvedValue(undefined),

            sendPasswordResetEmail:
              vi.fn()
                .mockResolvedValue(undefined),
          };

        const consumer =
          new TodoNotificationConsumer(
            channel,
            mailer,
            createDeliveryRepository(),
          );

        await consumer.start();

        const callback =
          consumeMock
            .mock.calls[0]?.[1] as
            (
              message:
                ConsumeMessage | null,
            ) => void;

        const malformedMessage:
          ConsumeMessage = {
            content:
              Buffer.from(
                "{invalid-json",
              ),

            fields:
              {} as ConsumeMessage["fields"],

            properties:
              {} as ConsumeMessage["properties"],
          };

        callback(
          malformedMessage,
        );

        await new Promise<void>(
          (resolve) => {
            setImmediate(resolve);
          },
        );

        expect(
          ackMock,
        ).not.toHaveBeenCalled();

        expect(
          nackMock,
        ).toHaveBeenCalledWith(
          malformedMessage,
          false,
          false,
        );
      },
    );
  },
);