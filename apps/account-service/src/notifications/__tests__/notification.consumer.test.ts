import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ConfirmChannel,
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

import type {
  NotificationDeliveryRepository,
} from "../notification-delivery.repository.interface.js";

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

      MAIL_RETRY_FIRST_MS: 30_000,
      MAIL_RETRY_SECOND_MS: 60_000,

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
  readonly channel: ConfirmChannel;
  readonly assertExchangeMock: ReturnType<typeof vi.fn>;
  readonly assertQueueMock: ReturnType<typeof vi.fn>;
  readonly bindQueueMock: ReturnType<typeof vi.fn>;
  readonly consumeMock: ReturnType<typeof vi.fn>;
  readonly ackMock: ReturnType<typeof vi.fn>;
  readonly nackMock: ReturnType<typeof vi.fn>;
  readonly sendToQueueMock: ReturnType<typeof vi.fn>;
  readonly waitForConfirmsMock: ReturnType<typeof vi.fn>;
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

  const sendToQueueMock =
    vi.fn().mockReturnValue(true);

  const waitForConfirmsMock =
    vi.fn().mockResolvedValue(undefined);

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

      sendToQueue:
        sendToQueueMock,

      waitForConfirms:
        waitForConfirmsMock,
    } as unknown as ConfirmChannel;

  return {
    channel,
    assertExchangeMock,
    assertQueueMock,
    bindQueueMock,
    consumeMock,
    ackMock,
    nackMock,
    sendToQueueMock,
    waitForConfirmsMock,
  };
}

function createMessage(
  payload: unknown,
  attempt = 1,
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
      headers: {
        "x-notification-attempt": attempt,
      },
    },
  } as unknown as ConsumeMessage;
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

function createDeliveryRepository(
  status:
    "claimed"
    | "completed"
    | "in-progress" = "claimed",
): {
  readonly repository: NotificationDeliveryRepository;
  readonly claimMock: ReturnType<typeof vi.fn>;
  readonly markSentMock: ReturnType<typeof vi.fn>;
  readonly markFailedMock: ReturnType<typeof vi.fn>;
  readonly markDeadLetterMock: ReturnType<typeof vi.fn>;
} {
  const claimMock =
    vi.fn().mockResolvedValue({
      status,
      processingToken:
        status === "claimed"
          ? "processing-token"
          : undefined,
    });

  const markSentMock =
    vi.fn().mockResolvedValue(undefined);

  const markFailedMock =
    vi.fn().mockResolvedValue(undefined);

  const markDeadLetterMock =
    vi.fn().mockResolvedValue(undefined);

  return {
    repository: {
      withRecipientGuard: async <T>(_accountId: string, action: (session: {
        findEmail: (accountId: string) => Promise<string | undefined>;
        reserveAddress: (eventId: string, accountId: string, email: string) => Promise<boolean>;
      }) => Promise<T>) => action({
        findEmail: async (accountId) => {
          const result = await database.query<{ email: string }>(
            `SELECT email FROM users WHERE id = $1 AND NOT EXISTS (
              SELECT 1 FROM account_deletion_requests WHERE user_id = users.id
              AND status IN ('pending', 'running'))`,
            [accountId],
          );
          return result.rows[0]?.email;
        },
        reserveAddress: vi.fn().mockResolvedValue(true),
      }),
      claim: claimMock,
      markSent: markSentMock,
      markFailed: markFailedMock,
      markDeadLetter: markDeadLetterMock,
    },
    claimMock,
    markSentMock,
    markFailedMock,
    markDeadLetterMock,
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

        const {
          repository,
        } =
          createDeliveryRepository();

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
            repository,
          );

        await consumer.initialize();

        expect(
          channel.assertExchangeMock,
        ).toHaveBeenCalledTimes(2);

        expect(
          channel.assertQueueMock,
        ).toHaveBeenCalledTimes(3);

        expect(channel.assertQueueMock).toHaveBeenCalledWith(
          "todo.notifications.retry",
          expect.objectContaining({
            durable: true,
            deadLetterExchange: "todo.events",
            deadLetterRoutingKey: "notification.retry",
          }),
        );

        expect(channel.bindQueueMock).toHaveBeenCalledWith(
          "todo.notifications",
          "todo.events",
          "notification.retry",
        );

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

        const {
          repository,
        } =
          createDeliveryRepository();

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
            repository,
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

        const {
          repository,
        } =
          createDeliveryRepository();

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
            repository,
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

    it("uses the destination pinned for the event instead of the default sink", async () => {
      const channel = createChannel();
      const { mailer: sinkMailer, sendTodoSharedEmailMock: sinkSend } = createMailer();
      const { mailer: providerMailer, sendTodoSharedEmailMock: providerSend } = createMailer();
      const { repository } = createDeliveryRepository();
      const selectMailer = vi.fn().mockResolvedValue(providerMailer);
      queryMock.mockResolvedValue({ rows: [{ email: "recipient@example.com" }], rowCount: 1 } as never);

      const consumer = new TodoNotificationConsumer(
        channel.channel, sinkMailer, repository, selectMailer,
      );
      await consumer.start();
      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent, 2));

      await vi.waitFor(() => {
        expect(channel.ackMock).toHaveBeenCalledOnce();
      });
      expect(selectMailer).toHaveBeenCalledWith(sharedEvent.eventId);
      expect(providerSend).toHaveBeenCalledOnce();
      expect(sinkSend).not.toHaveBeenCalled();
    });

    it("does not send when the registered address has reached its daily limit", async () => {
      const channel = createChannel();
      const { mailer, sendTodoSharedEmailMock } = createMailer();
      const { repository } = createDeliveryRepository();
      const reserveAddress = vi.fn().mockResolvedValue(false);
      const quotaRepository = Object.assign(repository, {
        withRecipientGuard: async <T>(
          _accountId: string,
          send: (session: { findEmail: () => Promise<string>; reserveAddress: typeof reserveAddress }) => Promise<T>,
        ) => send({
          findEmail: () => Promise.resolve("recipient@example.com"),
          reserveAddress,
        }),
      });
      queryMock.mockResolvedValue({
        rows: [{ email: "recipient@example.com" }],
        rowCount: 1,
      } as never);

      const consumer = new TodoNotificationConsumer(channel.channel, mailer, quotaRepository);
      await consumer.start();
      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent));

      await vi.waitFor(() => {
        expect(channel.ackMock).toHaveBeenCalledOnce();
      });
      expect(reserveAddress).toHaveBeenCalledWith(
        sharedEvent.eventId,
        sharedEvent.payload.recipientId,
        "recipient@example.com",
      );
      expect(sendTodoSharedEmailMock).not.toHaveBeenCalled();
    });

    it("skips a queued share when its recipient account no longer exists", async () => {
      const channel = createChannel();
      const { mailer, sendTodoSharedEmailMock } = createMailer();
      const { repository } = createDeliveryRepository();
      queryMock.mockResolvedValue({ rows: [], rowCount: 0 } as never);
      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();

      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent));

      await vi.waitFor(() => {
        expect(channel.ackMock).toHaveBeenCalledOnce();
      });
      expect(sendTodoSharedEmailMock).not.toHaveBeenCalled();
    });

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

        const {
          repository,
        } =
          createDeliveryRepository();

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
            repository,
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

        const {
          repository,
        } =
          createDeliveryRepository();

        queryMock.mockResolvedValue({
          rows: [{ email: "recipient@example.com" }],
          rowCount: 1,
        } as never);

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
            repository,
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
      "does not send a queued password-reset email when the account is pending deletion",
      async () => {
        const channel = createChannel();
        const { mailer, sendPasswordResetEmailMock } = createMailer();
        const { repository } = createDeliveryRepository();
        queryMock.mockResolvedValue({ rows: [], rowCount: 0 } as never);

        const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
        await consumer.start();
        const callback = channel.consumeMock.mock.calls[0]?.[1] as (message: ConsumeMessage) => void;
        callback(createMessage(passwordResetRequestedEvent));

        await vi.waitFor(() => {
          expect(channel.ackMock).toHaveBeenCalledOnce();
        });

        expect(queryMock.mock.calls[0]?.[0]).toContain("account_deletion_requests");
        expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
      },
    );

    it("does not send a reset token to a stale address after an email change", async () => {
      const channel = createChannel();
      const { mailer, sendPasswordResetEmailMock } = createMailer();
      const { repository } = createDeliveryRepository();
      queryMock.mockResolvedValue({
        rows: [{ email: "new-recipient@example.com" }],
        rowCount: 1,
      } as never);

      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();
      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(passwordResetRequestedEvent));

      await vi.waitFor(() => {
        expect(channel.ackMock).toHaveBeenCalledOnce();
      });
      expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    });

    it(
      "dead-letters invalid messages",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
        } =
          createMailer();

        const {
          repository,
        } =
          createDeliveryRepository();

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
            repository,
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

    it("dead-letters an invalid retry attempt without claiming or sending", async () => {
      const channel = createChannel();
      const { mailer, sendTodoSharedEmailMock } = createMailer();
      const { repository, claimMock } = createDeliveryRepository();
      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();

      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent, 4));

      await vi.waitFor(() => {
        expect(channel.nackMock).toHaveBeenCalledWith(
          expect.anything(), false, false,
        );
      });
      expect(claimMock).not.toHaveBeenCalled();
      expect(sendTodoSharedEmailMock).not.toHaveBeenCalled();
    });

    it(
      "delays a refused delivery and succeeds after retry",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
          sendTodoSharedEmailMock,
        } =
          createMailer();

        const {
          repository,
          markFailedMock,
        } =
          createDeliveryRepository();

        sendTodoSharedEmailMock
          .mockRejectedValueOnce(new Error("451 provider temporarily unavailable"))
          .mockResolvedValueOnce(undefined);

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
            repository,
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
          expect(channel.sendToQueueMock).toHaveBeenCalledTimes(1);
        });

        const [retryQueue, retryBody, retryOptions] =
          channel.sendToQueueMock.mock.calls[0] as unknown as [
            string,
            Buffer,
            {
              persistent: boolean;
              expiration: string;
              headers: Record<string, unknown>;
            },
          ];
        expect(retryQueue).toBe("todo.notifications.retry");
        expect(Buffer.isBuffer(retryBody)).toBe(true);
        expect(retryOptions.persistent).toBe(true);
        expect(retryOptions.expiration).toMatch(/^[1-9]\d*$/);
        expect(retryOptions.headers["x-notification-attempt"]).toBe(2);

        expect(
          markFailedMock,
        ).toHaveBeenCalledWith(
          sharedEvent.eventId,
          "processing-token",
          expect.any(String),
          false,
        );

        expect(channel.nackMock).not.toHaveBeenCalled();
        expect(channel.ackMock).toHaveBeenCalledTimes(1);
        expect(channel.waitForConfirmsMock).toHaveBeenCalledOnce();
        expect(channel.waitForConfirmsMock.mock.invocationCallOrder[0])
          .toBeLessThan(channel.ackMock.mock.invocationCallOrder[0] ?? 0);

        callback(createMessage(sharedEvent, 2));

        await vi.waitFor(() => {
          expect(sendTodoSharedEmailMock).toHaveBeenCalledTimes(2);
          expect(channel.ackMock).toHaveBeenCalledTimes(2);
        });
        expect(queryMock).toHaveBeenCalledTimes(2);
      },
    );

    it(
      "retries provider timeouts with backoff and dead-letters after three attempts",
      async () => {
        const channel = createChannel();
        const { mailer, sendTodoSharedEmailMock } = createMailer();
        const { repository, markFailedMock, markDeadLetterMock } = createDeliveryRepository();

        sendTodoSharedEmailMock.mockRejectedValue(
          new Error("Mail provider timed out"),
        );
        queryMock.mockResolvedValue({
          rows: [{ email: "recipient@example.com" }],
          rowCount: 1,
        } as never);

        const consumer = new TodoNotificationConsumer(
          channel.channel,
          mailer,
          repository,
        );
        await consumer.initialize();
        await consumer.start();

        const callback = channel.consumeMock.mock.calls[0]?.[1] as (
          message: ConsumeMessage,
        ) => void;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          callback(createMessage(sharedEvent, attempt));

          await vi.waitFor(() => {
            expect(markFailedMock).toHaveBeenCalledTimes(attempt);
          });

          if (attempt < 3) {
            await vi.waitFor(() => {
              expect(channel.sendToQueueMock).toHaveBeenCalledTimes(attempt);
              expect(channel.ackMock).toHaveBeenCalledTimes(attempt);
            });
            const [retryQueue, , retryOptions] =
              channel.sendToQueueMock.mock.calls[attempt - 1] as unknown as [
                string,
                Buffer,
                { headers: Record<string, unknown> },
              ];
            expect(retryQueue).toBe("todo.notifications.retry");
            expect(retryOptions.headers["x-notification-attempt"])
              .toBe(attempt + 1);
            expect(channel.nackMock).not.toHaveBeenCalled();
          }
        }

        const firstDelay = Number(
          (channel.sendToQueueMock.mock.calls[0]?.[2] as { expiration: string }).expiration,
        );
        const secondDelay = Number(
          (channel.sendToQueueMock.mock.calls[1]?.[2] as { expiration: string }).expiration,
        );
        expect(firstDelay).toBeGreaterThan(0);
        expect(secondDelay).toBeGreaterThan(firstDelay);
        expect(channel.waitForConfirmsMock).toHaveBeenCalledTimes(3);
        expect(channel.sendToQueueMock).toHaveBeenCalledTimes(3);
        expect(channel.sendToQueueMock).toHaveBeenCalledWith(
          "todo.notifications.dlq",
          expect.any(Buffer),
          expect.objectContaining({ persistent: true }),
        );
        await vi.waitFor(() => {
          expect(markDeadLetterMock).toHaveBeenCalledWith(sharedEvent.eventId);
          expect(channel.ackMock).toHaveBeenCalledTimes(3);
        });
        expect(channel.waitForConfirmsMock.mock.invocationCallOrder[2])
          .toBeLessThan(markDeadLetterMock.mock.invocationCallOrder[0] ?? 0);
        expect(channel.nackMock).not.toHaveBeenCalled();
        expect(sendTodoSharedEmailMock).toHaveBeenCalledTimes(3);
      },
    );

    it("defers a competing delivery until the active lease is free", async () => {
      const channel = createChannel();
      const { mailer, sendTodoSharedEmailMock } = createMailer();
      const { repository, claimMock } = createDeliveryRepository("in-progress");
      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();

      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent));

      await vi.waitFor(() => {
        expect(channel.ackMock).toHaveBeenCalledOnce();
      });
      const [queue, , options] = channel.sendToQueueMock.mock.calls[0] as unknown as [
        string, Buffer, { expiration: string; headers: Record<string, unknown> },
      ];
      expect(queue).toBe("todo.notifications.retry");
      expect(Number(options.expiration)).toBeGreaterThan(0);
      expect(options.headers["x-notification-attempt"]).toBe(1);
      expect(channel.waitForConfirmsMock.mock.invocationCallOrder[0])
        .toBeLessThan(channel.ackMock.mock.invocationCallOrder[0] ?? 0);
      expect(claimMock).toHaveBeenCalledWith(sharedEvent.eventId, 1);
      expect(sendTodoSharedEmailMock).not.toHaveBeenCalled();
      expect(channel.nackMock).not.toHaveBeenCalled();
    });

    it("recovers a retry after a crash between failure and publish", async () => {
      const channel = createChannel();
      const { mailer, sendTodoSharedEmailMock } = createMailer();
      const { repository } = createDeliveryRepository();
      repository.claim = vi.fn().mockResolvedValue({ status: "retry-pending" });
      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();

      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent));

      await vi.waitFor(() => {
        expect(channel.ackMock).toHaveBeenCalledOnce();
      });
      const [, , options] = channel.sendToQueueMock.mock.calls[0] as unknown as [
        string, Buffer, { headers: Record<string, unknown> },
      ];
      expect(options.headers["x-notification-attempt"]).toBe(2);
      expect(sendTodoSharedEmailMock).not.toHaveBeenCalled();
    });

    it("keeps the original delivery when retry publish is unconfirmed", async () => {
      const channel = createChannel();
      channel.waitForConfirmsMock.mockRejectedValueOnce(new Error("broker unavailable"));
      const { mailer } = createMailer();
      const { repository } = createDeliveryRepository();
      repository.claim = vi.fn().mockResolvedValue({ status: "retry-pending" });
      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();

      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent));

      await vi.waitFor(() => {
        expect(channel.nackMock).toHaveBeenCalledWith(
          expect.anything(), false, true,
        );
      });
      expect(channel.ackMock).not.toHaveBeenCalled();
    });

    it("finishes a pending DLQ handoff after a worker restart", async () => {
      const channel = createChannel();
      const { mailer, sendTodoSharedEmailMock } = createMailer();
      const { repository, markDeadLetterMock } = createDeliveryRepository();
      repository.claim = vi.fn().mockResolvedValue({ status: "dead-letter-pending" });
      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();

      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent, 3));

      await vi.waitFor(() => {
        expect(channel.ackMock).toHaveBeenCalledOnce();
      });
      expect(channel.sendToQueueMock).toHaveBeenCalledWith(
        "todo.notifications.dlq",
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );
      expect(channel.waitForConfirmsMock.mock.invocationCallOrder[0])
        .toBeLessThan(markDeadLetterMock.mock.invocationCallOrder[0] ?? 0);
      expect(sendTodoSharedEmailMock).not.toHaveBeenCalled();
    });

    it("does not acknowledge an unconfirmed DLQ handoff", async () => {
      const channel = createChannel();
      channel.waitForConfirmsMock.mockRejectedValueOnce(new Error("broker unavailable"));
      const { mailer } = createMailer();
      const { repository, markDeadLetterMock } = createDeliveryRepository();
      repository.claim = vi.fn().mockResolvedValue({ status: "dead-letter-pending" });
      const consumer = new TodoNotificationConsumer(channel.channel, mailer, repository);
      await consumer.start();

      const callback = channel.consumeMock.mock.calls[0]?.[1] as (
        message: ConsumeMessage,
      ) => void;
      callback(createMessage(sharedEvent, 3));

      await vi.waitFor(() => {
        expect(channel.nackMock).toHaveBeenCalledWith(
          expect.anything(), false, true,
        );
      });
      expect(markDeadLetterMock).not.toHaveBeenCalled();
      expect(channel.ackMock).not.toHaveBeenCalled();
    });

    it(
      "acknowledges a completed duplicate without sending",
      async () => {
        const channel =
          createChannel();

        const {
          mailer,
          sendTodoSharedEmailMock,
        } =
          createMailer();

        const {
          repository,
        } =
          createDeliveryRepository("completed");

        const consumer =
          new TodoNotificationConsumer(
            channel.channel,
            mailer,
            repository,
          );

        await consumer.start();

        const callback =
          channel.consumeMock.mock
            .calls[0]?.[1] as (
              message: ConsumeMessage,
            ) => void;

        callback(createMessage(sharedEvent));

        await vi.waitFor(() => {
          expect(channel.ackMock).toHaveBeenCalledTimes(1);
        });

        expect(sendTodoSharedEmailMock).not.toHaveBeenCalled();
      },
    );
  },
);