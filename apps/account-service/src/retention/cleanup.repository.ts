import {
  database,
} from "../config/database.js";

export interface CleanupCounts {
  refreshTokens: number;
  sessions: number;
  passwordResetTokens: number;
  outboxEvents: number;
  notificationDeliveries: number;
}

export interface CleanupCutoffs {
  session: Date;
  token: Date;
  outbox: Date;
  notification: Date;
}

export class AccountCleanupRepository {
  public async cleanup(
    cutoffs: CleanupCutoffs,
    batchSize: number,
  ): Promise<CleanupCounts> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      const refreshTokens = await client.query(
        `DELETE FROM refresh_tokens
         WHERE id IN (
           SELECT id
           FROM refresh_tokens
           WHERE (expires_at < $1 OR used_at < $1)
           ORDER BY id
           LIMIT $2
         )`,
        [cutoffs.token, batchSize],
      );

      const sessions = await client.query(
        `DELETE FROM sessions
         WHERE id IN (
           SELECT s.id
           FROM sessions s
           WHERE (s.expires_at < $1 OR s.revoked_at < $1)
             AND NOT EXISTS (
               SELECT 1
               FROM refresh_tokens rt
               WHERE rt.session_id = s.id
                 AND rt.used_at IS NULL
                 AND rt.expires_at >= $1
             )
           ORDER BY s.id
           LIMIT $2
         )`,
        [cutoffs.session, batchSize],
      );

      const passwordResetTokens = await client.query(
        `DELETE FROM password_reset_tokens
         WHERE id IN (
           SELECT id
           FROM password_reset_tokens
           WHERE (expires_at < $1 OR used_at < $1)
           ORDER BY id
           LIMIT $2
         )`,
        [cutoffs.token, batchSize],
      );

      const outboxEvents = await client.query(
        `DELETE FROM outbox_events
         WHERE id IN (
           SELECT id
           FROM outbox_events
           WHERE published_at IS NOT NULL
             AND published_at < $1
           ORDER BY id
           LIMIT $2
         )`,
        [cutoffs.outbox, batchSize],
      );

      const notificationDeliveries = await client.query(
        `DELETE FROM notification_event_deliveries
         WHERE event_id IN (
           SELECT event_id
           FROM notification_event_deliveries
           WHERE status <> 'processing'
             AND updated_at < $1
           ORDER BY updated_at, event_id
           LIMIT $2
         )`,
        [cutoffs.notification, batchSize],
      );

      await client.query("COMMIT");

      return {
        refreshTokens: refreshTokens.rowCount ?? 0,
        sessions: sessions.rowCount ?? 0,
        passwordResetTokens: passwordResetTokens.rowCount ?? 0,
        outboxEvents: outboxEvents.rowCount ?? 0,
        notificationDeliveries:
          notificationDeliveries.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}