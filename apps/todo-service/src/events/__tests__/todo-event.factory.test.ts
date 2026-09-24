import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createTodoCompletedEvent,
  createTodoCreatedEvent,
  createTodoDeletedEvent,
  createTodoSharedEvent,
  createTodoShareWithdrawnEvent,
} from "../todo-event.factory.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const requestId =
  "224d07f1-8812-429c-a0a6-092d83977ad5";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const recipientId =
  "1bc664af-ceff-4ea2-82d1-a44fbb5cb773";

const shareId =
  "f0c8fdcf-bf84-4d17-a7fd-5ab7349d987c";

describe(
  "TODO event factory",
  () => {
    it(
      "creates a TODO-created event",
      () => {
        const event =
          createTodoCreatedEvent(
            {
              todoId,
              ownerId,

              title:
                "Prepare report",
            },
            requestId,
          );

        expect(event).toMatchObject({
          eventType:
            "todo.created",

          eventVersion:
            1,

          producer:
            "todo-service",

          requestId,

          payload: {
            todoId,
            ownerId,

            title:
              "Prepare report",
          },
        });

        expect(
          event.eventId,
        ).toMatch(
          UUID_PATTERN,
        );

        expect(
          Number.isNaN(
            Date.parse(
              event.occurredAt,
            ),
          ),
        ).toBe(false);
      },
    );

    it(
      "creates a TODO-completed event",
      () => {
        const event =
          createTodoCompletedEvent(
            {
              todoId,
              ownerId,

              completedByUserId:
                recipientId,
            },
            requestId,
          );

        expect(event).toMatchObject({
          eventType:
            "todo.completed",

          payload: {
            todoId,
            ownerId,

            completedByUserId:
              recipientId,
          },
        });
      },
    );

    it(
      "creates a TODO-shared event",
      () => {
        const event =
          createTodoSharedEvent(
            {
              shareId,
              todoId,
              ownerId,
              recipientId,
            },
            requestId,
          );

        expect(event).toMatchObject({
          eventType:
            "todo.shared",

          payload: {
            shareId,
            todoId,
            ownerId,
            recipientId,
          },
        });
      },
    );

    it(
      "creates a share-withdrawn event",
      () => {
        const event =
          createTodoShareWithdrawnEvent(
            {
              shareId,
              todoId,
              ownerId,
              recipientId,
            },
            requestId,
          );

        expect(event).toMatchObject({
          eventType:
            "todo.share-withdrawn",

          payload: {
            shareId,
            todoId,
            ownerId,
            recipientId,
          },
        });
      },
    );

    it(
      "creates a TODO-deleted event",
      () => {
        const event =
          createTodoDeletedEvent(
            {
              todoId,
              ownerId,

              deletedByUserId:
                ownerId,
            },
            requestId,
          );

        expect(event).toMatchObject({
          eventType:
            "todo.deleted",

          payload: {
            todoId,
            ownerId,

            deletedByUserId:
              ownerId,
          },
        });
      },
    );
  },
);