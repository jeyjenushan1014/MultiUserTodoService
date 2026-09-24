import {
  beforeEach,
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

function createTestEvent(): OutboxEvent {
  return {
    id:
      "5403d006-532f-4d5f-8200-9893fe84e00d",

    aggregateType:
      "account",

    aggregateId:
      "3bf53c86-0932-43d0-85ed-bd536c694677",

    eventType:
      "account.password-reset-requested",

    eventVersion: 1,

    payload: {
      userId:
        "3bf53c86-0932-43d0-85ed-bd536c694677",
    },

    requestId:
      "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",

    occurredAt:
      new Date(
        "2026-09-22T10:00:00.000Z",
      ),

    publishAttempts: 0,
  };
}

describe(
  "OutboxService",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "publishes and marks an event as published",
      async () => {
        const claimPendingEventsMock =
          vi.fn<
            OutboxRepository[
              "claimPendingEvents"
            ]
          >();

        const markPublishedMock =
          vi.fn<
            OutboxRepository[
              "markPublished"
            ]
          >();

        const markFailedMock =
          vi.fn<
            OutboxRepository[
              "markFailed"
            ]
          >();

        const releaseWorkerLocksMock =
          vi.fn<
            OutboxRepository[
              "releaseWorkerLocks"
            ]
          >();

        const publishMock =
          vi.fn<
            EventPublisher[
              "publish"
            ]
          >();

        claimPendingEventsMock
          .mockResolvedValue([
            createTestEvent(),
          ]);

        publishMock
          .mockResolvedValue(undefined);

        markPublishedMock
          .mockResolvedValue(undefined);

        const repository:
          OutboxRepository = {
            claimPendingEvents:
              claimPendingEventsMock,

            markPublished:
              markPublishedMock,

            markFailed:
              markFailedMock,

            releaseWorkerLocks:
              releaseWorkerLocksMock,
          };

        const publisher:
          EventPublisher = {
            ready: true,

            connect:
              vi.fn(),

            publish:
              publishMock,

            close:
              vi.fn(),
          };

        const service =
          new OutboxService(
            repository,
            publisher,
            "worker-one",
          );

        const result =
          await service.processBatch();

        expect(result).toEqual({
          claimed: 1,
          published: 1,
          failed: 0,
        });

        expect(
          publishMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          markPublishedMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          markFailedMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "schedules a retry when publishing fails",
      async () => {
        const claimPendingEventsMock =
          vi.fn<
            OutboxRepository[
              "claimPendingEvents"
            ]
          >();

        const markPublishedMock =
          vi.fn<
            OutboxRepository[
              "markPublished"
            ]
          >();

        const markFailedMock =
          vi.fn<
            OutboxRepository[
              "markFailed"
            ]
          >();

        const releaseWorkerLocksMock =
          vi.fn<
            OutboxRepository[
              "releaseWorkerLocks"
            ]
          >();

        const publishMock =
          vi.fn<
            EventPublisher[
              "publish"
            ]
          >();

        claimPendingEventsMock
          .mockResolvedValue([
            createTestEvent(),
          ]);

        publishMock
          .mockRejectedValue(
            new Error(
              "RabbitMQ unavailable",
            ),
          );

        markFailedMock
          .mockResolvedValue(undefined);

        const repository:
          OutboxRepository = {
            claimPendingEvents:
              claimPendingEventsMock,

            markPublished:
              markPublishedMock,

            markFailed:
              markFailedMock,

            releaseWorkerLocks:
              releaseWorkerLocksMock,
          };

        const publisher:
          EventPublisher = {
            ready: true,

            connect:
              vi.fn(),

            publish:
              publishMock,

            close:
              vi.fn(),
          };

        const service =
          new OutboxService(
            repository,
            publisher,
            "worker-one",
          );

        const result =
          await service.processBatch();

        expect(result).toEqual({
          claimed: 1,
          published: 0,
          failed: 1,
        });

        expect(
          markPublishedMock,
        ).not.toHaveBeenCalled();

        expect(
          markFailedMock,
        ).toHaveBeenCalledTimes(1);

        const firstCall =
          markFailedMock.mock.calls[0];

        expect(firstCall).toBeDefined();

        expect(
          firstCall?.[0].errorMessage,
        ).toBe(
          "RabbitMQ unavailable",
        );
      },
    );

    it(
      "returns an empty result when no events are available",
      async () => {
        const repository:
          OutboxRepository = {
            claimPendingEvents:
              vi.fn()
                .mockResolvedValue([]),

            markPublished:
              vi.fn(),

            markFailed:
              vi.fn(),

            releaseWorkerLocks:
              vi.fn(),
          };

        const publisher:
          EventPublisher = {
            ready: true,

            connect:
              vi.fn(),

            publish:
              vi.fn(),

            close:
              vi.fn(),
          };

        const service =
          new OutboxService(
            repository,
            publisher,
            "worker-one",
          );

        await expect(
          service.processBatch(),
        ).resolves.toEqual({
          claimed: 0,
          published: 0,
          failed: 0,
        });
      },
    );
  },
);