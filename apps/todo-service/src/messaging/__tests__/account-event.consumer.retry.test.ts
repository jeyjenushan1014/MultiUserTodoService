import type {
  ConfirmChannel,
  ConsumeMessage,
  Options,
} from "amqplib";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  env,
} from "../../config/env.js";

import {
  AccountEventConsumer,
} from "../account-event.consumer.js";

import type {
  OwnerProjectionService,
} from "../owner-projection.service.js";

interface AccountEventConsumerInternals {
  configureTopology(
    channel: ConfirmChannel,
  ): Promise<void>;

  retryOrDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void>;
}

interface ChannelFixture {
  readonly channel: ConfirmChannel;
  readonly assertQueueMock: ReturnType<typeof vi.fn>;
  readonly bindQueueMock: ReturnType<typeof vi.fn>;
  readonly publishMock: ReturnType<typeof vi.fn>;
}

function createChannelFixture(): ChannelFixture {
  const assertQueueMock = vi.fn().mockResolvedValue({});
  const bindQueueMock = vi.fn().mockResolvedValue({});
  const publishMock = vi.fn().mockReturnValue(true);

  const channel = {
    assertExchange: vi.fn().mockResolvedValue({}),
    assertQueue: assertQueueMock,
    bindQueue: bindQueueMock,
    publish: publishMock,
    waitForConfirms: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConfirmChannel;

  return {
    channel,
    assertQueueMock,
    bindQueueMock,
    publishMock,
  };
}

function createMessage(eventType: string): ConsumeMessage {
  return {
    content: Buffer.from(
      JSON.stringify({
        eventType,
      }),
    ),
    fields: {
      deliveryTag: 1,
      redelivered: false,
      exchange: env.RABBITMQ_EXCHANGE,
      routingKey: eventType,
    },
    properties: {
      contentType: "application/json",
      headers: {},
    },
  };
}

function getInternals(
  consumer: AccountEventConsumer,
): AccountEventConsumerInternals {
  return consumer as unknown as AccountEventConsumerInternals;
}

describe(
  "AccountEventConsumer retry topology",
  () => {
    it(
      "preserves each account event routing key through retry and back to the owner queue",
      async () => {
        const fixture = createChannelFixture();
        const consumer = new AccountEventConsumer(
          {} as OwnerProjectionService,
        );
        const internals = getInternals(consumer);

        await internals.configureTopology(
          fixture.channel,
        );

        const retryQueueDeclaration =
          fixture.assertQueueMock.mock.calls.find(
            ([queueName]) =>
              queueName === env.TODO_OWNER_RETRY_QUEUE,
          ) as [string, Options.AssertQueue] | undefined;

        expect(retryQueueDeclaration).toBeDefined();
        expect(
          retryQueueDeclaration?.[1].arguments,
        ).not.toHaveProperty(
          "x-dead-letter-routing-key",
        );

        expect(
          fixture.bindQueueMock.mock.calls,
        ).toEqual(
          expect.arrayContaining([
            [
              env.TODO_OWNER_QUEUE,
              env.RABBITMQ_EXCHANGE,
              "account.registered",
            ],
            [
              env.TODO_OWNER_QUEUE,
              env.RABBITMQ_EXCHANGE,
              "account.email-changed",
            ],
            [
              env.TODO_OWNER_RETRY_QUEUE,
              env.RABBITMQ_RETRY_EXCHANGE,
              "account.registered",
            ],
            [
              env.TODO_OWNER_RETRY_QUEUE,
              env.RABBITMQ_RETRY_EXCHANGE,
              "account.email-changed",
            ],
          ]),
        );

        await internals.retryOrDeadLetter(
          fixture.channel,
          createMessage("account.registered"),
        );
        await internals.retryOrDeadLetter(
          fixture.channel,
          createMessage("account.email-changed"),
        );

        expect(
          fixture.publishMock.mock.calls.map(
            ([exchange, routingKey]) => [
              String(exchange),
              String(routingKey),
            ],
          ),
        ).toEqual([
          [
            env.RABBITMQ_RETRY_EXCHANGE,
            "account.registered",
          ],
          [
            env.RABBITMQ_RETRY_EXCHANGE,
            "account.email-changed",
          ],
        ]);
      },
    );
  },
);