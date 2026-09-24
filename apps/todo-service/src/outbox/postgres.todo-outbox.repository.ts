import {
  database,
} from "../config/database.js";

import type {
  TodoOutboxRepository,
} from "./todo-outbox.repository.interface.js";

import type {
  ClaimTodoOutboxEventsOptions,
  MarkTodoOutboxFailedData,
  MarkTodoOutboxPublishedData,
  TodoOutboxEvent,
  TodoOutboxEventType,
} from "./todo-outbox.types.js";

interface TodoOutboxEventRow {
  readonly id:
    string;

  readonly aggregate_id:
    string;

  readonly event_type:
    string;

  readonly event_version:
    number;

  readonly payload:
    unknown;

  readonly request_id:
    string;

  readonly occurred_at:
    Date;

  readonly publish_attempts:
    number;
}

function parseEventType(
  eventType: string,
): TodoOutboxEventType {
  switch (eventType) {
    case "todo.created":
    case "todo.completed":
    case "todo.shared":
    case "todo.share-withdrawn":
    case "todo.deleted":
      return eventType;

    default:
      throw new Error(
        `Unsupported TODO outbox event type: ${eventType}`,
      );
  }
}

function mapOutboxEvent(
  row:
    TodoOutboxEventRow,
): TodoOutboxEvent {
  if (
    !(row.occurred_at instanceof Date) ||
    Number.isNaN(
      row.occurred_at.getTime(),
    )
  ) {
    throw new Error(
      "PostgreSQL returned an invalid outbox occurrence date",
    );
  }

  if (
    !Number.isSafeInteger(
      row.publish_attempts,
    ) ||
    row.publish_attempts < 1
  ) {
    throw new Error(
      "PostgreSQL returned an invalid outbox attempt count",
    );
  }

  return {
    id:
      row.id,

    aggregateId:
      row.aggregate_id,

    eventType:
      parseEventType(
        row.event_type,
      ),

    eventVersion:
      row.event_version,

    payload:
      row.payload,

    requestId:
      row.request_id,

    occurredAt:
      row.occurred_at,

    publishAttempts:
      row.publish_attempts,
  };
}

function assertUpdated(
  rowCount:
    number | null,
  operation:
    string,
): void {
  if (rowCount !== 1) {
    throw new Error(
      `TODO outbox event could not be ${operation}`,
    );
  }
}

export class PostgresTodoOutboxRepository
implements TodoOutboxRepository {
  public async claimPendingEvents(
    options:
      ClaimTodoOutboxEventsOptions,
  ): Promise<
    readonly TodoOutboxEvent[]
  > {
    const result =
      await database.query<
        TodoOutboxEventRow
      >(
        `
          WITH claimable_events AS (
            SELECT
              id

            FROM outbox_events

            WHERE published_at
                IS NULL

              AND next_attempt_at <=
                CURRENT_TIMESTAMP

              AND (
                locked_at IS NULL

                OR locked_at <
                  CURRENT_TIMESTAMP -
                  (
                    $3::integer *
                    INTERVAL '1 millisecond'
                  )
              )

            ORDER BY
              occurred_at ASC,
              id ASC

            FOR UPDATE
            SKIP LOCKED

            LIMIT $1
          )

          UPDATE outbox_events
            AS claimed_event

          SET
            locked_at =
              CURRENT_TIMESTAMP,

            locked_by =
              $2,

            publish_attempts =
              claimed_event.publish_attempts +
              1

          FROM claimable_events

          WHERE claimed_event.id =
            claimable_events.id

          RETURNING
            claimed_event.id,
            claimed_event.aggregate_id,
            claimed_event.event_type,
            claimed_event.event_version,
            claimed_event.payload,
            claimed_event.request_id,
            claimed_event.occurred_at,
            claimed_event.publish_attempts
        `,
        [
          options.batchSize,
          options.workerId,
          options
            .lockTimeoutMilliseconds,
        ],
      );

    return result.rows.map(
      mapOutboxEvent,
    );
  }

  public async markPublished(
    data:
      MarkTodoOutboxPublishedData,
  ): Promise<void> {
    const result =
      await database.query(
        `
          UPDATE outbox_events

          SET
            published_at =
              CURRENT_TIMESTAMP,

            last_error =
              NULL,

            locked_at =
              NULL,

            locked_by =
              NULL

          WHERE id = $1
            AND locked_by = $2
            AND published_at
              IS NULL
        `,
        [
          data.eventId,
          data.workerId,
        ],
      );

    assertUpdated(
      result.rowCount,
      "marked as published",
    );
  }

  public async markFailed(
    data:
      MarkTodoOutboxFailedData,
  ): Promise<void> {
    const result =
      await database.query(
        `
          UPDATE outbox_events

          SET
            next_attempt_at =
              $3,

            last_error =
              $4,

            locked_at =
              NULL,

            locked_by =
              NULL

          WHERE id = $1
            AND locked_by = $2
            AND published_at
              IS NULL
        `,
        [
          data.eventId,
          data.workerId,
          data.nextAttemptAt,
          data.errorMessage,
        ],
      );

    assertUpdated(
      result.rowCount,
      "scheduled for retry",
    );
  }
}