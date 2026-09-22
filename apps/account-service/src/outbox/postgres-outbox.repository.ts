import {
  database,
} from "../config/database.js";

import type {
  OutboxRepository,
} from "./outbox.repository.interface.js";

import type {
  OutboxEvent,
  OutboxFailure,
} from "./outbox.types.js";

interface OutboxEventRow {
  readonly id: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly event_type: string;
  readonly event_version: number;
  readonly payload: unknown;
  readonly request_id: string;
  readonly occurred_at: Date;
  readonly publish_attempts: number;
}

function mapOutboxEvent(
  row: OutboxEventRow,
): OutboxEvent {
  return {
    id: row.id,
    aggregateType:
      row.aggregate_type,
    aggregateId:
      row.aggregate_id,
    eventType:
      row.event_type,
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

export class PostgresOutboxRepository
implements OutboxRepository {
  public async claimPendingEvents(
    workerId: string,
    batchSize: number,
    lockTimeoutSeconds: number,
  ): Promise<readonly OutboxEvent[]> {
    const result =
      await database.query<OutboxEventRow>(
        `
          WITH claimable_events AS (
            SELECT id
            FROM outbox_events
            WHERE published_at IS NULL
              AND next_attempt_at <= CURRENT_TIMESTAMP
              AND (
                locked_at IS NULL
                OR locked_at <
                  CURRENT_TIMESTAMP -
                  ($3 * INTERVAL '1 second')
              )
            ORDER BY occurred_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          UPDATE outbox_events
          SET
            locked_at = CURRENT_TIMESTAMP,
            locked_by = $1
          FROM claimable_events
          WHERE outbox_events.id =
            claimable_events.id
          RETURNING
            outbox_events.id,
            outbox_events.aggregate_type,
            outbox_events.aggregate_id,
            outbox_events.event_type,
            outbox_events.event_version,
            outbox_events.payload,
            outbox_events.request_id,
            outbox_events.occurred_at,
            outbox_events.publish_attempts
        `,
        [
          workerId,
          batchSize,
          lockTimeoutSeconds,
        ],
      );

    return result.rows.map(
      mapOutboxEvent,
    );
  }

  public async markPublished(
    eventId: string,
    workerId: string,
    publishedAt: Date,
  ): Promise<void> {
    const result =
      await database.query(
        `
          UPDATE outbox_events
          SET
            published_at = $3,
            publish_attempts =
              publish_attempts + 1,
            last_error = NULL,
            locked_at = NULL,
            locked_by = NULL
          WHERE id = $1
            AND locked_by = $2
            AND published_at IS NULL
        `,
        [
          eventId,
          workerId,
          publishedAt,
        ],
      );

    if (result.rowCount !== 1) {
      throw new Error(
        `Outbox event ${eventId} was not owned by worker ${workerId}`,
      );
    }
  }

  public async markFailed(
    failure: OutboxFailure,
    workerId: string,
  ): Promise<void> {
    const result =
      await database.query(
        `
          UPDATE outbox_events
          SET
            publish_attempts =
              publish_attempts + 1,
            next_attempt_at = $3,
            last_error = $4,
            locked_at = NULL,
            locked_by = NULL
          WHERE id = $1
            AND locked_by = $2
            AND published_at IS NULL
        `,
        [
          failure.eventId,
          workerId,
          failure.nextAttemptAt,
          failure.errorMessage,
        ],
      );

    if (result.rowCount !== 1) {
      throw new Error(
        `Outbox event ${failure.eventId} was not owned by worker ${workerId}`,
      );
    }
  }

  public async releaseWorkerLocks(
    workerId: string,
  ): Promise<void> {
    await database.query(
      `
        UPDATE outbox_events
        SET
          locked_at = NULL,
          locked_by = NULL
        WHERE locked_by = $1
          AND published_at IS NULL
      `,
      [
        workerId,
      ],
    );
  }
}