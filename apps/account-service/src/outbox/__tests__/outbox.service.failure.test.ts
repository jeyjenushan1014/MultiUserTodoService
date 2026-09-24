import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  EventPublisher,
} from "../event-publisher.interface.js";

import type {
  OutboxRepository,
} from "../outbox.repository.interface.js";

import type {
  OutboxEvent,
} from "../outbox.types.js";

import {
  OutboxService,
} from "../outbox.service.js";

const event: OutboxEvent = {
  id:
    "11111111-1111-4111-8111-111111111111",

  aggregateType:
    "account",

  aggregateId:
    "22222222-2222-4222-8222-222222222222",

  eventType:
    "account.registered",

  eventVersion:
    1,

  payload: {
    userId:
      "22222222-2222-4222-8222-222222222222",
  },

  requestId:
    "33333333-3333-4333-8333-333333333333",

  occurredAt:
    new Date(
      "2026-09-24T10:00:00.000Z",
    ),

  publishAttempts:
    0,
};

interface RepositoryDependencies {
  readonly repository:
    OutboxRepository;

  readonly markPublishedMock:
    ReturnType<typeof vi.fn>;

  readonly markFailedMock:
    ReturnType<typeof vi.fn>;

  readonly releaseWorkerLocksMock:
    ReturnType<typeof vi.fn>;
}

function createRepository(
  events:
    readonly OutboxEvent[],
): RepositoryDependencies {
  const claimPendingEventsMock =
    vi.fn()
      .mockResolvedValue(events);

  const markPublishedMock =
    vi.fn()
      .mockResolvedValue(undefined);

  const markFailedMock =
    vi.fn()
      .mockResolvedValue(undefined);

  const releaseWorkerLocksMock =
    vi.fn()
      .mockResolvedValue(undefined);

  return {
    repository: {
      claimPendingEvents:
        claimPendingEventsMock,

      markPublished:
        markPublishedMock,

      markFailed:
        markFailedMock,

      releaseWorkerLocks:
        releaseWorkerLocksMock,
    },

    markPublishedMock,
    markFailedMock,
    releaseWorkerLocksMock,
  };
}

interface PublisherDependencies {
  readonly publisher:
    EventPublisher;

  readonly publishMock:
    ReturnType<typeof vi.fn>;
}

function createPublisher(
  publishMock:
    ReturnType<typeof vi.fn>,
): PublisherDependencies {
  return {
    publisher: {
      connect:
        vi.fn()
          .mockResolvedValue(undefined),

      publish:
        publishMock,

      close:
        vi.fn()
          .mockResolvedValue(undefined),

      ready:
        true,
    },

    publishMock,
  };
}

describe(
  "OutboxService failure handling",
  () => {
    it(
      "marks an event as failed when publishing fails",
      async () => {
        const repositoryDependencies =
          createRepository([
            event,
          ]);

        const publisherDependencies =
          createPublisher(
            vi.fn()
              .mockRejectedValue(
                new Error(
                  "RabbitMQ unavailable",
                ),
              ),
          );

        const service =
          new OutboxService(
            repositoryDependencies.repository,
            publisherDependencies.publisher,
            "worker-1",
          );

        const result =
          await service.processBatch();

        expect(result).toEqual({
          claimed:
            1,

          published:
            0,

          failed:
            1,
        });

        expect(
          repositoryDependencies.markFailedMock,
        ).toHaveBeenCalledOnce();

        expect(
          repositoryDependencies.markPublishedMock,
        ).not.toHaveBeenCalled();

        expect(
          publisherDependencies.publishMock,
        ).toHaveBeenCalledOnce();
      },
    );

    it(
      "continues after one event fails",
      async () => {
        const secondEvent:
          OutboxEvent = {
            ...event,

            id:
              "44444444-4444-4444-8444-444444444444",
          };

        const repositoryDependencies =
          createRepository([
            event,
            secondEvent,
          ]);

        const publisherDependencies =
          createPublisher(
            vi.fn()
              .mockRejectedValueOnce(
                new Error(
                  "Temporary failure",
                ),
              )
              .mockResolvedValueOnce(
                undefined,
              ),
          );

        const service =
          new OutboxService(
            repositoryDependencies.repository,
            publisherDependencies.publisher,
            "worker-1",
          );

        const result =
          await service.processBatch();

        expect(result).toEqual({
          claimed:
            2,

          published:
            1,

          failed:
            1,
        });

        expect(
          repositoryDependencies.markFailedMock,
        ).toHaveBeenCalledOnce();

        expect(
          repositoryDependencies.markPublishedMock,
        ).toHaveBeenCalledOnce();

        expect(
          publisherDependencies.publishMock,
        ).toHaveBeenCalledTimes(2);
      },
    );

    it(
      "releases worker locks",
      async () => {
        const repositoryDependencies =
          createRepository([]);

        const publisherDependencies =
          createPublisher(
            vi.fn()
              .mockResolvedValue(undefined),
          );

        const service =
          new OutboxService(
            repositoryDependencies.repository,
            publisherDependencies.publisher,
            "worker-1",
          );

        await service.releaseLocks();

        expect(
          repositoryDependencies.releaseWorkerLocksMock,
        ).toHaveBeenCalledWith(
          "worker-1",
        );
      },
    );
  },
);