import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  Channel,
  ConsumeMessage,
} from "amqplib";

import {
  TodoNotificationConsumer,
} from "../notification.consumer.js";

import {
  encryptPasswordResetToken,
} from "../../modules/account/password-reset/password-reset-token.crypto.js";

import type {
  NotificationMailer,
} from "../notification.mailer.js";

vi.mock(
  "../../config/env.js",
  () => ({
    env: {
      RABBITMQ_EXCHANGE:
        "todo.events",

      RABBITMQ_NOTIFICATION_QUEUE:
        "todo.notifications",

      RABBITMQ_DEAD_LETTER_EXCHANGE:
        "todo.events.dlx",

      RABBITMQ_NOTIFICATION_DLQ:
        "todo.notifications.dlq",

      INTERNAL_SERVICE_SECRET:
        "test-internal-service-secret-with-more-than-32-characters",
    },
  }),
);

vi.mock(
  "../../config/database.js",
  () => ({
    database: {
      query: vi.fn(),
    },
  }),
);

vi.mock(
  "../../config/logger.js",
  () => ({
    logger: {
      error: vi.fn(),
    },
  }),
);

import {
  database,
} from "../../config/database.js";

const queryMock = vi.mocked(database.query); // eslint-disable-line @typescript-eslint/unbound-method

interface ChannelMocks {
  readonly channel: Channel;
  readonly assertExchangeMock: ReturnType<typeof vi.fn>;
  readonly assertQueueMock: ReturnType<typeof vi.fn>;
  readonly bindQueueMock: ReturnType<typeof vi.fn>;
  readonly consumeMock: ReturnType<typeof vi.fn>;
  readonly ackMock: ReturnType<typeof vi.fn>;
  readonly nackMock: ReturnType<typeof vi.fn>;
}

function createChannel(): ChannelMocks {
  const assertExchangeMock =
    vi.fn().mockResolvedValue({
      exchange: "todo.events",
    });

  const assertQueueMock =
    vi.fn().mockResolvedValue({
      queue: "todo.notifications",
      messageCount: 0,
      consumerCount: 0,
    });

  const bindQueueMock =
    vi.fn().mockResolvedValue(undefined);

  const consumeMock =
    vi.fn().mockResolvedValue({
      consumerTag: "consumer-tag",
    });

  const ackMock =
    vi.fn();

  const nackMock =
    vi.fn();

  const channel =
    {
      assertExchange:
        assertExchangeMock,

      assertQueue:
        assertQueueMock,

      bindQueue:
        bindQueueMock,

      consume:
        consumeMock,

      ack:
        ackMock,

      nack:
        nackMock,
    } as unknown as Channel;

  return {
    channel,
    assertExchangeMock,
    assertQueueMock,
    bindQueueMock,
    consumeMock,
    ackMock,
    nackMock,
  };
}

function createMessage(
  payload: unknown,
): ConsumeMessage {
  return {
    content: Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ),

    fields: {
      consumerTag: "consumer-tag",
      deliveryTag: 1,
      redelivered: false,
      exchange: "todo.events",
      routingKey: "todo.shared",
    },

    properties: {
      contentType:
        "application/json",
      headers: {},
    },
  } as ConsumeMessage;
}

function createMailer(): {
  mailer: NotificationMailer;
  sendTodoSharedEmailMock: ReturnType<typeof vi.fn>;
  sendTodoShareWithdrawnEmailMock: ReturnType<typeof vi.fn>;
  sendPasswordResetEmailMock: ReturnType<typeof vi.fn>;
} {
  const sendTodoSharedEmailMock =
    vi.fn().mockResolvedValue(undefined);

  const sendTodoShareWithdrawnEmailMock =
    vi.fn().mockResolvedValue(undefined);

  const sendPasswordResetEmailMock =
    vi.fn().mockResolvedValue(undefined);

  return {
    mailer: {
      sendTodoSharedEmail:
        sendTodoSharedEmailMock,

      sendTodoShareWithdrawnEmail:
        sendTodoShareWithdrawnEmailMock,

      sendPasswordResetEmail:
        sendPasswordResetEmailMock,
    },

    sendTodoSharedEmailMock,
    sendTodoShareWithdrawnEmailMock,
    sendPasswordResetEmailMock,
  };
}

const sharedEvent = {
  eventId:
    "5403d006-532f-4d5f-8200-9893fe84e00d",

  eventType:
    "todo.shared",

  eventVersion: 1,

  producer:
    "todo-service",

  requestId:
    "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",

  occurredAt:
    "2026-09-24T10:00:00.000Z",

  payload: {
    shareId:
      "e0ff170f-f355-4dbd-b246-f087715d59ca",

    todoId:
      "3bf53c86-0932-43d0-85ed-bd536c694677",

    ownerId:
      "906d8bf4-6a14-40cb-a380-60909c0741db",

    recipientId:
      "7e2c3d67-0b12-4f65-9c70-2cdbbb443c4e",
  },
};

const withdrawnEvent = {
  eventId:
    "5403d006-532f-4d5f-8200-9893fe84e00d",

  eventType:
    "todo.share-withdrawn",

  eventVersion: 1,

  producer:
    "todo-service",

  requestId:
    "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",

  occurredAt:
    "2026-09-24T10:00:00.000Z",

  payload: {
    shareId:
      "e0ff170f-f355-4dbd-b246-f087715d59ca",

    todoId:
      "3bf53c86-0932-43d0-85ed-bd536c694677",

    ownerId:
      "906d8bf4-6a14-40cb-a380-60909c0741db",

    recipientId:
      "7e2c3d67-0b12-4f65-9c70-2cdbbb443c4e",
  },
};

const passwordResetRequestedEvent = {
  eventId:
    "7d4b5d3d-1c7b-4f09-8d8d-438b3d5e7e3d",

  eventType:
    "account.password-reset-requested",

  eventVersion: 1,

  producer:
    "account-service",

  requestId:
    "0a1fd5d3-3d6e-4f9d-9a1d-82d79175efcc",

  occurredAt:
    "2026-09-24T11:00:00.000Z",

  payload: {
    userId:
      "8a7d9d1c-7f79-4d13-8d42-24f5d8769a2b",

    email:
      "recipient@example.com",

    encryptedResetToken:
      encryptPasswordResetToken(
        "reset-token",
      ),

    expiresAt:
      "2026-09-24T12:00:00.000Z",
  },
};

describe(
  "TodoNotificationConsumer",
  () => {
    beforeEach(() => {
      queryMock.mockReset();
    });

    it(
      "initializes exchanges, queues, and bindings",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
        } =
          createMailer();

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
          );

        await consumer.initialize();

        expect(
          channel.assertExchangeMock,
        ).toHaveBeenCalledTimes(2);

        expect(
          channel.assertQueueMock,
        ).toHaveBeenCalledTimes(2);

        expect(
          channel.bindQueueMock,
        ).toHaveBeenCalledWith(
          "todo.notifications",
          "todo.events",
          "todo.shared",
        );

        expect(
          channel.bindQueueMock,
        ).toHaveBeenCalledWith(
          "todo.notifications",
          "todo.events",
          "todo.share-withdrawn",
        );
      },
    );

    it(
      "starts consuming notification messages",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
        } =
          createMailer();

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
          );

        await consumer.start();

        expect(
          channel.consumeMock,
        ).toHaveBeenCalledWith(
          "todo.notifications",
          expect.any(Function),
        );
      },
    );

    it(
      "sends an email for todo.shared",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
          sendTodoSharedEmailMock,
        } =
          createMailer();

        queryMock.mockResolvedValue({
          rows: [
            {
              email:
                "recipient@example.com",
            },
          ],

          rowCount: 1,
        } as never);

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
          );

        await consumer.start();

        const callback =
          channel.consumeMock.mock
            .calls[0]?.[1] as (
              message: ConsumeMessage,
            ) => void;

        callback(
          createMessage(
            sharedEvent,
          ),
        );

        await vi.waitFor(() => {
          expect(
            sendTodoSharedEmailMock,
          ).toHaveBeenCalledWith(
            "recipient@example.com",
            sharedEvent.payload.todoId,
          );
        });

        expect(
          channel.ackMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "sends an email for todo.share-withdrawn",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
          sendTodoShareWithdrawnEmailMock,
        } =
          createMailer();

        queryMock.mockResolvedValue({
          rows: [
            {
              email:
                "recipient@example.com",
            },
          ],

          rowCount: 1,
        } as never);

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
          );

        await consumer.start();

        const callback =
          channel.consumeMock.mock
            .calls[0]?.[1] as (
              message: ConsumeMessage,
            ) => void;

        callback(
          createMessage(
            withdrawnEvent,
          ),
        );

        await vi.waitFor(() => {
          expect(
            sendTodoShareWithdrawnEmailMock,
          ).toHaveBeenCalledWith(
            "recipient@example.com",
            withdrawnEvent.payload.todoId,
          );
        });

        expect(
          channel.ackMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "sends an email for account.password-reset-requested",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
          sendPasswordResetEmailMock,
        } =
          createMailer();

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
          );

        await consumer.start();

        const callback =
          channel.consumeMock.mock
            .calls[0]?.[1] as (
              message: ConsumeMessage,
            ) => void;

        callback(
          createMessage(
            passwordResetRequestedEvent,
          ),
        );

        await vi.waitFor(() => {
          expect(
            sendPasswordResetEmailMock,
          ).toHaveBeenCalledWith(
            "recipient@example.com",
            "reset-token",
            passwordResetRequestedEvent.payload.expiresAt,
          );
        });

        expect(
          channel.ackMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "dead-letters invalid messages",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
        } =
          createMailer();

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
          );

        await consumer.start();

        const callback =
          channel.consumeMock.mock
            .calls[0]?.[1] as (
              message: ConsumeMessage,
            ) => void;

        callback(
          createMessage({
            invalid: true,
          }),
        );

        await vi.waitFor(() => {
          expect(
            channel.nackMock,
          ).toHaveBeenCalledWith(
            expect.anything(),
            false,
            false,
          );
        });
      },
    );

    it(
      "dead-letters messages when mail delivery fails",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
          sendTodoSharedEmailMock,
        } =
          createMailer();

        sendTodoSharedEmailMock.mockRejectedValue(
          new Error("SMTP unavailable"),
        );

        queryMock.mockResolvedValue({
          rows: [
            {
              email:
                "recipient@example.com",
            },
          ],

          rowCount: 1,
        } as never);

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
          );

        await consumer.start();

        const callback =
          channel.consumeMock.mock
            .calls[0]?.[1] as (
              message: ConsumeMessage,
            ) => void;

        callback(
          createMessage(
            sharedEvent,
          ),
        );

        await vi.waitFor(() => {
          expect(
            channel.nackMock,
          ).toHaveBeenCalledWith(
            expect.anything(),
            false,
            false,
          );
        });
      },
    );
  },
);