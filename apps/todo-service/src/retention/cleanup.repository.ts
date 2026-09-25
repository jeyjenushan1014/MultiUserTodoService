import {
  database,
} from "../config/database.js";

export interface TodoCleanupCounts {
  processedEvents: number;
  outboxEvents: number;
}

export interface TodoCleanupCutoffs {
  event: Date;
  outbox: Date;
}

export class TodoCleanupRepository {
  public async cleanup(
    cutoffs: TodoCleanupCutoffs,
    batchSize: number,
  ): Promise<TodoCleanupCounts> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      const processedEvents = await client.query(
        `DELETE FROM processed_events
         WHERE event_id IN (
           SELECT event_id
           FROM processed_events
           WHERE processed_at < $1
           ORDER BY processed_at, event_id
           LIMIT $2
         )`,
        [cutoffs.event, batchSize],
      );

      const outboxEvents = await client.query(
        `DELETE FROM outbox_events
         WHERE id IN (
           SELECT id
           FROM outbox_events
           WHERE published_at IS NOT NULL
             AND published_at < $1
           ORDER BY published_at, id
           LIMIT $2
         )`,
        [cutoffs.outbox, batchSize],
      );

      await client.query("COMMIT");

      return {
        processedEvents: processedEvents.rowCount ?? 0,
        outboxEvents: outboxEvents.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}