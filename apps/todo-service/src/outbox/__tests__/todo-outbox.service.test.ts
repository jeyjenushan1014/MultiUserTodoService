import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  MockedFunction,
} from "vitest";

import type {
  TodoEventPublisher,
} from "../todo-event.publisher.interface.js";

import type {
  TodoOutboxRepository,
} from "../todo-outbox.repository.interface.js";

import {
  TodoOutboxService,
} from "../todo-outbox.service.js";

import type {
  TodoOutboxEvent,
} from "../todo-outbox.types.js";

interface Dependencies {
  readonly claimPendingEventsMock:
    MockedFunction<
      TodoOutboxRepository[
        "claimPendingEvents"
      ]
    >;

  readonly markPublishedMock:
    MockedFunction<
      TodoOutboxRepository[
        "markPublished"
      ]
    >;

  readonly markFailedMock:
    MockedFunction<
      TodoOutboxRepository[
        "markFailed"
      ]
    >;

  readonly publishMock:
    MockedFunction<
      TodoEventPublisher[
        "publish"
      ]
    >;

  readonly service:
    TodoOutboxService;
}

const workerId =
  "todo-outbox-worker-1";

const currentTime =
  new Date(
    "2026-09-24T14:00:00.000Z",
  );

function createEvent(
  eventId: string,
  publishAttempts:
    number = 1,
): TodoOutboxEvent {
  return {
    id:
      eventId,

    aggregateId:
      "9f134ed0-4503-4a23-a189-f065fe9fd838",

    eventType:
      "todo.created",

    eventVersion:
      1,

    payload: {
      eventId,

      eventType:
        "todo.created",

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

        title:
          "Prepare report",
      },
    },

    requestId:
      "224d07f1-8812-429c-a0a6-092d83977ad5",

    occurredAt:
      new Date(
        "2026-09-24T13:00:00.000Z",
      ),

    publishAttempts,
  };
}

function createDependencies():
  Dependencies {
  const claimPendingEventsMock =
    vi.fn<
      TodoOutboxRepository[
        "claimPendingEvents"
      ]
    >();

  const markPublishedMock =
    vi.fn<
      TodoOutboxRepository[
        "markPublished"
      ]
    >();

  const markFailedMock =
    vi.fn<
      TodoOutboxRepository[
        "markFailed"
      ]
    >();

  const publishMock =
    vi.fn<
      TodoEventPublisher[
        "publish"
      ]
    >();

  const repository:
    TodoOutboxRepository = {
      claimPendingEvents:
        claimPendingEventsMock,

      markPublished:
        markPublishedMock,

      markFailed:
        markFailedMock,
    };

  const publisher:
    TodoEventPublisher = {
      publish:
        publishMock,
    };

  return {
    claimPendingEventsMock,
    markPublishedMock,
    markFailedMock,
    publishMock,

    service:
      new TodoOutboxService(
        repository,
        publisher,
        {
          workerId,

          batchSize:
            25,

          lockTimeoutMilliseconds:
            30_000,
        },
        () => currentTime,
      ),
  };
}

describe(
  "TodoOutboxService",
  () => {
    it(
      "returns an empty result when no events are available",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .claimPendingEventsMock
          .mockResolvedValueOnce(
            [],
          );

        const result =
          await dependencies
            .service
            .processBatch();

        expect(result).toEqual({
          claimed:
            0,

          published:
            0,

          failed:
            0,
        });

        expect(
          dependencies
            .publishMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "publishes and marks a claimed event as published",
      async () => {
        const dependencies =
          createDependencies();

        const event =
          createEvent(
            "11111111-1111-4111-8111-111111111111",
          );

        dependencies
          .claimPendingEventsMock
          .mockResolvedValueOnce([
            event,
          ]);

        dependencies
          .publishMock
          .mockResolvedValueOnce(
            undefined,
          );

        dependencies
          .markPublishedMock
          .mockResolvedValueOnce(
            undefined,
          );

        const result =
          await dependencies
            .service
            .processBatch();

        expect(
          dependencies
            .publishMock,
        ).toHaveBeenCalledWith(
          event,
        );

        expect(
          dependencies
            .markPublishedMock,
        ).toHaveBeenCalledWith({
          eventId:
            event.id,

          workerId,
        });

        expect(
          dependencies
            .markFailedMock,
        ).not.toHaveBeenCalled();

        expect(result).toEqual({
          claimed:
            1,

          published:
            1,

          failed:
            0,
        });
      },
    );

    it(
      "schedules a failed publication using exponential backoff",
      async () => {
        const dependencies =
          createDependencies();

        const event =
          createEvent(
            "11111111-1111-4111-8111-111111111111",
            3,
          );

        dependencies
          .claimPendingEventsMock
          .mockResolvedValueOnce([
            event,
          ]);

        dependencies
          .publishMock
          .mockRejectedValueOnce(
            new Error(
              "RabbitMQ unavailable",
            ),
          );

        dependencies
          .markFailedMock
          .mockResolvedValueOnce(
            undefined,
          );

        const result =
          await dependencies
            .service
            .processBatch();

        expect(
          dependencies
            .markFailedMock,
        ).toHaveBeenCalledWith({
          eventId:
            event.id,

          workerId,

          nextAttemptAt:
            new Date(
              "2026-09-24T14:00:04.000Z",
            ),

          errorMessage:
            "RabbitMQ unavailable",
        });

        expect(
          dependencies
            .markPublishedMock,
        ).not.toHaveBeenCalled();

        expect(result).toEqual({
          claimed:
            1,

          published:
            0,

          failed:
            1,
        });
      },
    );

    it(
      "continues processing after one event fails",
      async () => {
        const dependencies =
          createDependencies();

        const firstEvent =
          createEvent(
            "11111111-1111-4111-8111-111111111111",
          );

        const secondEvent =
          createEvent(
            "22222222-2222-4222-8222-222222222222",
          );

        dependencies
          .claimPendingEventsMock
          .mockResolvedValueOnce([
            firstEvent,
            secondEvent,
          ]);

        dependencies
          .publishMock
          .mockRejectedValueOnce(
            new Error(
              "Temporary failure",
            ),
          )
          .mockResolvedValueOnce(
            undefined,
          );

        dependencies
          .markFailedMock
          .mockResolvedValueOnce(
            undefined,
          );

        dependencies
          .markPublishedMock
          .mockResolvedValueOnce(
            undefined,
          );

        const result =
          await dependencies
            .service
            .processBatch();

        expect(
          dependencies
            .publishMock,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          dependencies
            .markFailedMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId:
              firstEvent.id,
          }),
        );

        expect(
          dependencies
            .markPublishedMock,
        ).toHaveBeenCalledWith({
          eventId:
            secondEvent.id,

          workerId,
        });

        expect(result).toEqual({
          claimed:
            2,

          published:
            1,

          failed:
            1,
        });
      },
    );
  },
);