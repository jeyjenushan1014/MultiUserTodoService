import {
  randomUUID,
} from "node:crypto";

import {
  database,
} from "../config/database.js";

import type { PoolClient } from "pg";

import type {
  NotificationDeliveryClaim,
  NotificationDeliveryRepository,
  NotificationRecipientSession,
} from "./notification-delivery.repository.interface.js";

interface NotificationDeliveryRow {
  readonly status: "processing" | "retry_pending" | "sent" | "dead_letter_pending" | "dead_letter" | "replay_publishing" | "replay_queued" | "failed";
  readonly processing_token: string;
  readonly attempts: number;
  readonly claimed: boolean;
}

const leaseSeconds = 300;
const dailyAddressLimit = 5;

async function releaseRecipientGuard(
  client: PoolClient,
  accountId: string,
  locked: boolean,
): Promise<void> {
  if (!locked) {
    client.release();
    return;
  }

  try {
    await client.query(
      "SELECT pg_advisory_unlock(hashtextextended($1::text, 0))",
      [accountId],
    );
    client.release();
  } catch (error) {
    client.release(true);
    throw error;
  }
}

function recipientSession(client: PoolClient): NotificationRecipientSession {
  return {
    async findEmail(accountId) {
      const result = await client.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1
         AND NOT EXISTS (
           SELECT 1 FROM account_deletion_requests
           WHERE user_id = users.id AND status IN ('pending', 'running')
         )`,
        [accountId],
      );
      return result.rows[0]?.email;
    },

    async reserveAddress(eventId, accountId, email) {
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 1))",
          [email],
        );
        const registered = await client.query(
          `SELECT 1 FROM users WHERE id = $1 AND email = $2
           AND NOT EXISTS (
             SELECT 1 FROM account_deletion_requests
             WHERE user_id = users.id AND status IN ('pending', 'running')
           )`,
          [accountId, email],
        );
        if (registered.rowCount !== 1) {
          await client.query("COMMIT");
          return false;
        }

        const existing = await client.query(
          `SELECT 1 FROM notification_address_reservations
           WHERE event_id = $1 AND email = $2 AND user_id = $3`,
          [eventId, email, accountId],
        );
        if (existing.rowCount === 1) {
          await client.query("COMMIT");
          return true;
        }

        const used = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM notification_address_reservations
           WHERE email = $1 AND reserved_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'`,
          [email],
        );
        if (Number(used.rows[0]?.count) >= dailyAddressLimit) {
          await client.query("COMMIT");
          return false;
        }

        await client.query(
          `INSERT INTO notification_address_reservations (event_id, user_id, email)
           VALUES ($1, $2, $3)`,
          [eventId, accountId, email],
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
  };
}

export class PostgresNotificationDeliveryRepository
implements NotificationDeliveryRepository {
  public async withRecipientGuard<T>(
    accountId: string,
    action: (session: NotificationRecipientSession) => Promise<T>,
  ): Promise<T> {
    const client = await database.connect();
    let locked = false;
    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtextextended($1::text, 0))",
        [accountId],
      );
      locked = true;
      return await action(recipientSession(client));
    } finally {
      await releaseRecipientGuard(client, accountId, locked);
    }
  }

  public async claim(
    eventId: string,
    attempt = 1,
  ): Promise<{
    readonly status: NotificationDeliveryClaim;
    readonly processingToken?: string;
  }> {
    const processingToken = randomUUID();

    const result =
      await database.query<NotificationDeliveryRow>(
        `
          WITH claimed_delivery AS (
            INSERT INTO notification_event_deliveries (
              event_id,
              status,
              processing_token,
              lease_until,
              attempts
            )
            VALUES (
              $1,
              'processing',
              $2,
              CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'),
              $4
            )
            ON CONFLICT (event_id) DO UPDATE
            SET
              status = 'processing',
              processing_token = $2,
              lease_until = CURRENT_TIMESTAMP +
                ($3 * INTERVAL '1 second'),
              attempts = $4,
              last_error = NULL,
              updated_at = CURRENT_TIMESTAMP
            WHERE (
              notification_event_deliveries.status = 'retry_pending'
              AND notification_event_deliveries.attempts + 1 = $4
            ) OR (
              notification_event_deliveries.status = 'processing'
              AND notification_event_deliveries.attempts = $4
              AND notification_event_deliveries.lease_until <= CURRENT_TIMESTAMP
            ) OR (
              notification_event_deliveries.status IN ('replay_queued', 'replay_publishing')
              AND $4 = 1
            )
            RETURNING
              status,
              processing_token,
              attempts,
              TRUE AS claimed
          )
          SELECT
            status,
            processing_token,
            attempts,
            claimed
          FROM claimed_delivery
          UNION ALL
          SELECT
            status,
            processing_token,
            attempts,
            FALSE AS claimed
          FROM notification_event_deliveries
          WHERE event_id = $1
            AND NOT EXISTS (
              SELECT 1
              FROM claimed_delivery
            )
        `,
        [
          eventId,
          processingToken,
          leaseSeconds,
          attempt,
        ],
      );

    let row = result.rows[0];

    if (row === undefined) {
      const visibleAfterConflict = await database.query<NotificationDeliveryRow>(
        `SELECT status, processing_token, attempts, FALSE AS claimed
         FROM notification_event_deliveries WHERE event_id = $1`,
        [eventId],
      );
      row = visibleAfterConflict.rows[0];
    }

    if (row === undefined) {
      throw new Error(
        `Notification delivery record ${eventId} was not found`,
      );
    }

    if (row.claimed) {
      return {
        status: "claimed",
        processingToken: row.processing_token,
      };
    }

    return {
      status:
        row.status === "sent" || row.status === "dead_letter"
          ? "completed"
          : row.attempts !== attempt
            ? "stale"
            : row.status === "retry_pending" && row.attempts === attempt
              ? "retry-pending"
              : row.status === "dead_letter_pending" && row.attempts === attempt
                ? "dead-letter-pending"
              : "in-progress",
    };
  }

  public async markSent(
    eventId: string,
    processingToken: string,
  ): Promise<void> {
    const result =
      await database.query(
        `
          UPDATE notification_event_deliveries
          SET
            status = 'sent',
            lease_until = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE event_id = $1
            AND processing_token = $2
            AND status = 'processing'
        `,
        [eventId, processingToken],
      );

    if (result.rowCount !== 1) {
      throw new Error(
        `Notification delivery ${eventId} was not owned by processing token ${processingToken}`,
      );
    }
  }

  public async markFailed(
    eventId: string,
    processingToken: string,
    errorMessage: string,
    terminal = false,
  ): Promise<void> {
    const result = await database.query(
      `
        UPDATE notification_event_deliveries
        SET
          status = CASE WHEN $4 THEN 'dead_letter_pending' ELSE 'retry_pending' END,
          lease_until = CURRENT_TIMESTAMP,
          last_error = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE event_id = $1
          AND processing_token = $2
          AND status = 'processing'
      `,
      [eventId, processingToken, errorMessage, terminal],
    );

    if (result.rowCount !== 1) {
      throw new Error(`Notification delivery ${eventId} lost its processing lease`);
    }
  }

  public async markDeadLetter(eventId: string): Promise<void> {
    const result = await database.query(
      `UPDATE notification_event_deliveries
       SET status = 'dead_letter', updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $1 AND status = 'dead_letter_pending'`,
      [eventId],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Notification delivery ${eventId} was not pending dead-letter confirmation`);
    }
  }

  public async resetForReplay(eventId: string): Promise<
    { readonly status: "ready"; readonly processingToken: string }
    | { readonly status: "completed" }
  > {
    const processingToken = randomUUID();
    const reset = await database.query(
      `UPDATE notification_event_deliveries
       SET status = 'replay_publishing', attempts = 1,
           processing_token = $2,
           lease_until = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'),
           updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $1 AND (
         status = 'dead_letter' OR
         (status = 'replay_publishing' AND lease_until <= CURRENT_TIMESTAMP)
       )
       RETURNING event_id`,
      [eventId, processingToken, leaseSeconds],
    );
    if (reset.rowCount === 1) {
      return { status: "ready", processingToken };
    }

    const current = await database.query<{ status: string }>(
      "SELECT status FROM notification_event_deliveries WHERE event_id = $1",
      [eventId],
    );
    if (current.rows[0]?.status === "sent" || current.rows[0]?.status === "replay_queued") {
      return { status: "completed" };
    }

    throw new Error(`Notification delivery ${eventId} is not ready for DLQ replay`);
  }

  public async markReplayQueued(eventId: string, processingToken: string): Promise<void> {
    const result = await database.query(
      `UPDATE notification_event_deliveries
      SET status = 'replay_queued', lease_until = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $1 AND processing_token = $2
         AND status = 'replay_publishing'`,
      [eventId, processingToken],
    );
    if (result.rowCount !== 1) {
      const consumed = await database.query<{ status: string }>(
        `SELECT status FROM notification_event_deliveries
         WHERE event_id = $1 AND status IN (
           'processing', 'sent', 'retry_pending', 'dead_letter_pending', 'dead_letter'
         )`,
        [eventId],
      );
      if (consumed.rowCount === 1) return;
      throw new Error(`Notification delivery ${eventId} lost its replay lease`);
    }
  }
}