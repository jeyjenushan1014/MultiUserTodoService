import {
  database,
} from "../../../config/database.js";

import {
  insertSessionRevokedOutboxEvent,
} from "../../../outbox/session-revoked-event.js";

import type {
  LogoutRepository,
} from "./logout.repository.interface.js";

export class PostgresLogoutRepository
implements LogoutRepository {
  public async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<boolean> {
    const client =
      await database.connect();

    try {
      await client.query("BEGIN");

      const result =
        await client.query<{
          id: string;
          revoked_at: Date;
        }>(
          `
            UPDATE sessions
            SET revoked_at =
              COALESCE(
                revoked_at,
                CURRENT_TIMESTAMP
              )
            WHERE
              id = $1
              AND user_id = $2
            RETURNING id, revoked_at
          `,
          [
            sessionId,
            userId,
          ],
        );

      const session =
        result.rows[0];

      if (session !== undefined) {
        await insertSessionRevokedOutboxEvent(
          client,
          userId,
          session.id,
          session.revoked_at,
        );
      }

      await client.query("COMMIT");

      return result.rowCount === 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async revokeAllSessions(
    userId: string,
  ): Promise<number> {
    const client =
      await database.connect();

    try {
      await client.query("BEGIN");

      const result =
        await client.query<{
          revoked_at: Date;
        }>(
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
            RETURNING revoked_at
          `,
          [
            userId,
          ],
        );

      if (
        (result.rowCount ?? 0) > 0
      ) {
        await insertSessionRevokedOutboxEvent(
          client,
          userId,
          null,
          result.rows[0]?.revoked_at ??
            new Date(),
        );
      }

      await client.query("COMMIT");

      return result.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}