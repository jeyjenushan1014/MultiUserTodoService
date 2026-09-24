import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  TodoEventPublisher,
} from "../todo-event.publisher.interface.js";

import type {
  TodoOutboxRepository,
} from "../todo-outbox.repository.interface.js";

import type {
  TodoOutboxEvent,
} from "../todo-outbox.types.js";

import {
  TodoOutboxService,
} from "../todo-outbox.service.js";

const event: TodoOutboxEvent = {
  id:
    "11111111-1111-4111-8111-111111111111",

  aggregateId:
    "22222222-2222-4222-8222-222222222222",

  eventType:
    "todo.created",

  eventVersion:
    1,

  payload: {
    todoId:
      "22222222-2222-4222-8222-222222222222",

    ownerId:
      "33333333-3333-4333-8333-333333333333",
  },

  requestId:
    "44444444-4444-4444-8444-444444444444",

  occurredAt:
    new Date(
      "2026-09-24T10:00:00.000Z",
    ),

  publishAttempts:
    0,
};

describe(
  "TodoOutboxService failure handling",
  () => {
    it(
      "marks failed publication for retry",
      async () => {
        const claimPendingEventsMock =
          vi.fn()
            .mockResolvedValue([
              event,
            ]);

        const markPublishedMock =
          vi.fn()
            .mockResolvedValue(undefined);

        const markFailedMock =
          vi.fn()
            .mockResolvedValue(undefined);

        const repository:
          TodoOutboxRepository = {
            claimPendingEvents:
              claimPendingEventsMock,

            markPublished:
              markPublishedMock,

            markFailed:
              markFailedMock,
          };

        const publishMock =
          vi.fn()
            .mockRejectedValue(
              new Error(
                "RabbitMQ unavailable",
              ),
            );

        const publisher:
          TodoEventPublisher = {
            publish:
              publishMock,
          };

        const service =
          new TodoOutboxService(
            repository,
            publisher,
            {
              workerId:
                "todo-worker-1",

              batchSize:
                10,

              lockTimeoutMilliseconds:
                60_000,
            },
            () =>
              new Date(
                "2026-09-24T10:01:00.000Z",
              ),
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
          markFailedMock,
        ).toHaveBeenCalledOnce();

        expect(
          markPublishedMock,
        ).not.toHaveBeenCalled();

        expect(
          publishMock,
        ).toHaveBeenCalledOnce();
      },
    );
  },
);