import type {
  TodoIntegrationEvent,
} from "@todo/contracts";

import type {
  TodoOutboxTransaction,
  TodoOutboxWriter,
} from "./todo-outbox.writer.interface.js";

export class PostgresTodoOutboxWriter
implements TodoOutboxWriter {
  public async append(
    transaction:
      TodoOutboxTransaction,

    event:
      TodoIntegrationEvent,
  ): Promise<void> {
    await transaction.query(
      `
        INSERT INTO outbox_events (
          id,
          aggregate_type,
          aggregate_id,
          event_type,
          event_version,
          payload,
          request_id,
          occurred_at,
          published_at,
          publish_attempts,
          next_attempt_at,
          last_error,
          locked_at,
          locked_by
        )
        VALUES (
          $1,
          'todo',
          $2,
          $3,
          $4,
          $5::jsonb,
          $6,
          $7,
          NULL,
          0,
          CURRENT_TIMESTAMP,
          NULL,
          NULL,
          NULL
        )
      `,
      [
        event.eventId,
        event.payload.todoId,
        event.eventType,
        event.eventVersion,
        JSON.stringify(event),
        event.requestId,
        event.occurredAt,
      ],
    );
  }
}