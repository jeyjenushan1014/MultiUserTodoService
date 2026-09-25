import {
  randomUUID,
} from "node:crypto";

import {
  database,
} from "../config/database.js";

import type {
  NotificationDeliveryClaim,
  NotificationDeliveryRepository,
} from "./notification-delivery.repository.interface.js";

interface NotificationDeliveryRow {
  readonly status: NotificationDeliveryClaim | "sent";
  readonly processing_token: string;
  readonly claimed: boolean;
}

const leaseSeconds = 300;

export class PostgresNotificationDeliveryRepository
implements NotificationDeliveryRepository {
  public async claim(
    eventId: string,
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
              lease_until
            )
            VALUES (
              $1,
              'processing',
              $2,
              CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second')
            )
            ON CONFLICT (event_id) DO UPDATE
            SET
              status = 'processing',
              processing_token = $2,
              lease_until = CURRENT_TIMESTAMP +
                ($3 * INTERVAL '1 second'),
              attempts = notification_event_deliveries.attempts + 1,
              last_error = NULL,
              updated_at = CURRENT_TIMESTAMP
            WHERE notification_event_deliveries.status <> 'sent'
              AND (
                notification_event_deliveries.status <> 'processing'
                OR notification_event_deliveries.lease_until <=
                  CURRENT_TIMESTAMP
              )
            RETURNING
              status,
              processing_token,
              TRUE AS claimed
          )
          SELECT
            status,
            processing_token,
            claimed
          FROM claimed_delivery
          UNION ALL
          SELECT
            status,
            processing_token,
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
        ],
      );

    const row = result.rows[0];

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
        row.status === "sent"
          ? "completed"
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
  ): Promise<void> {
    await database.query(
      `
        UPDATE notification_event_deliveries
        SET
          status = 'failed',
          lease_until = CURRENT_TIMESTAMP,
          last_error = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE event_id = $1
          AND processing_token = $2
          AND status = 'processing'
      `,
      [eventId, processingToken, errorMessage],
    );
  }
}