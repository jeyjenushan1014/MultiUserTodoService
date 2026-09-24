import type {
  QueryResult,
} from "pg";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  PostgresTodoOutboxRepository,
} from "../postgres.todo-outbox.repository.js";

const databaseMocks =
  vi.hoisted(
    () => ({
      query:
        vi.fn(),
    }),
  );

vi.mock(
  "../../config/database.js",
  () => ({
    database: {
      query:
        databaseMocks.query,
    },
  }),
);

type TestQueryResult =
  QueryResult<
    Record<string, unknown>
  >;

const eventId =
  "f0c8fdcf-bf84-4d17-a7fd-5ab7349d987c";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const requestId =
  "224d07f1-8812-429c-a0a6-092d83977ad5";

const workerId =
  "todo-outbox-worker-1";

const occurredAt =
  new Date(
    "2026-09-24T13:00:00.000Z",
  );

const eventPayload = {
  eventId,

  eventType:
    "todo.deleted",

  eventVersion:
    1,

  producer:
    "todo-service",

  requestId,

  occurredAt:
    occurredAt.toISOString(),

  payload: {
    todoId,
    ownerId,

    deletedByUserId:
      ownerId,
  },
};

function createQueryResult(
  rows:
    readonly Record<
      string,
      unknown
    >[] = [],

  rowCount:
    number = rows.length,
): TestQueryResult {
  return {
    command:
      "UPDATE",

    rowCount,

    oid:
      0,

    fields:
      [],

    rows:
      [...rows],
  };
}

beforeEach(
  () => {
    databaseMocks
      .query
      .mockReset();
  },
);

describe(
  "PostgresTodoOutboxRepository",
  () => {
    it(
      "claims pending events and maps their delivery state",
      async () => {
        databaseMocks
          .query
          .mockResolvedValueOnce(
            createQueryResult([
              {
                id:
                  eventId,

                aggregate_id:
                  todoId,

                event_type:
                  "todo.deleted",

                event_version:
                  1,

                payload:
                  eventPayload,

                request_id:
                  requestId,

                occurred_at:
                  occurredAt,

                publish_attempts:
                  2,
              },
            ]),
          );

        const repository =
          new PostgresTodoOutboxRepository();

        const result =
          await repository
            .claimPendingEvents({
              batchSize:
                25,

              workerId,

              lockTimeoutMilliseconds:
                30_000,
            });

        expect(result).toEqual([
          {
            id:
              eventId,

            aggregateId:
              todoId,

            eventType:
              "todo.deleted",

            eventVersion:
              1,

            payload:
              eventPayload,

            requestId,

            occurredAt,

            publishAttempts:
              2,
          },
        ]);

        expect(
          databaseMocks.query,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            "SKIP LOCKED",
          ),
          [
            25,
            workerId,
            30_000,
          ],
        );
      },
    );

    it(
      "marks a worker-owned event as published",
      async () => {
        databaseMocks
          .query
          .mockResolvedValueOnce(
            createQueryResult(
              [],
              1,
            ),
          );

        const repository =
          new PostgresTodoOutboxRepository();

        await repository
          .markPublished({
            eventId,
            workerId,
          });

        expect(
          databaseMocks.query,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            "published_at",
          ),
          [
            eventId,
            workerId,
          ],
        );
      },
    );

    it(
      "rejects publication when the worker no longer owns the lock",
      async () => {
        databaseMocks
          .query
          .mockResolvedValueOnce(
            createQueryResult(
              [],
              0,
            ),
          );

        const repository =
          new PostgresTodoOutboxRepository();

        await expect(
          repository
            .markPublished({
              eventId,
              workerId,
            }),
        ).rejects.toThrow(
          "TODO outbox event could not be marked as published",
        );
      },
    );

    it(
      "releases a failed event and schedules its next attempt",
      async () => {
        databaseMocks
          .query
          .mockResolvedValueOnce(
            createQueryResult(
              [],
              1,
            ),
          );

        const repository =
          new PostgresTodoOutboxRepository();

        const nextAttemptAt =
          new Date(
            "2026-09-24T13:01:00.000Z",
          );

        await repository
          .markFailed({
            eventId,
            workerId,
            nextAttemptAt,

            errorMessage:
              "RabbitMQ unavailable",
          });

        expect(
          databaseMocks.query,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            "next_attempt_at",
          ),
          [
            eventId,
            workerId,
            nextAttemptAt,
            "RabbitMQ unavailable",
          ],
        );
      },
    );
  },
);