import type {
  PoolClient,
} from "pg";

import type {
  AccountEmailChangedEvent,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import type {
  EmailChangeRepository,
} from "./email-change.repository.interface.js";

import type {
  ChangeEmailData,
  ChangedEmailRow,
  EmailChangeCredentialRow,
} from "./email-change.types.js";

import { logger } from "../../../config/logger.js";


async function rollback(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch (error: unknown) {
      logger.error(
        { err: error },
        "Failed to rollback database transaction",
      );
    }
}

export class PostgresEmailChangeRepository
implements EmailChangeRepository {
  public async findActiveCredential(
    userId: string,
    sessionId: string,
  ): Promise<
    EmailChangeCredentialRow | undefined
  > {
    const result =
      await database
        .query<EmailChangeCredentialRow>(
          `
            SELECT
              u.id,
              u.email,
              u.password_hash
            FROM users u
            INNER JOIN sessions s
              ON s.user_id = u.id
            WHERE
              u.id = $1
              AND s.id = $2
              AND s.revoked_at IS NULL
              AND s.expires_at >
                CURRENT_TIMESTAMP
            LIMIT 1
          `,
          [
            userId,
            sessionId,
          ],
        );

    return result.rows[0];
  }

  public async changeEmail(
    data: ChangeEmailData,
  ): Promise<ChangedEmailRow> {
    const client =
      await database.connect();

    try {
      await client.query("BEGIN");

      const updateResult =
        await client
          .query<ChangedEmailRow>(
            `
              UPDATE users
              SET
                email = $1,
                updated_at = $2
              WHERE id = $3
              RETURNING
                id,
                email,
                updated_at
            `,
            [
              data.email,
              data.occurredAt,
              data.userId,
            ],
          );

      const user =
        updateResult.rows[0];

      if (user === undefined) {
        throw new Error(
          "Email update returned no user",
        );
      }

      const event:
        AccountEmailChangedEvent = {
          eventId:
            data.eventId,

          eventType:
            "account.email-changed",

          eventVersion: 1,

          occurredAt:
            data.occurredAt
              .toISOString(),

          requestId:
            data.requestId,

          producer:
            "account-service",

          payload: {
            userId:
              user.id,
            email:
              user.email,
          },
        };

      await client.query(
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
            publish_attempts
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::jsonb,
            $7,
            $8,
            0
          )
        `,
        [
          event.eventId,
          "account",
          user.id,
          event.eventType,
          event.eventVersion,
          JSON.stringify(event.payload),
          event.requestId,
          data.occurredAt,
        ],
      );

      /*
       * JWT contains the old email.
       * Revoke every existing session so that
       * the user must authenticate again.
       */
      await client.query(
        `
          UPDATE sessions
          SET revoked_at =
            COALESCE(
              revoked_at,
              CURRENT_TIMESTAMP
            )
          WHERE
            user_id = $1
            AND revoked_at IS NULL
        `,
        [
          data.userId,
        ],
      );

      await client.query("COMMIT");

      return user;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}