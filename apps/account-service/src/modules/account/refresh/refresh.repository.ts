import type {
  PoolClient,
} from "pg";

import {
  database,
} from "../../../config/database.js";

import type {
  RefreshRepository,
} from "./refresh.repository.interface.js";

import { logger } from "../../../config/logger.js";

import type {
  RefreshCredentialRow,
  RefreshRotationResult,
  RotateRefreshTokenData,
} from "./refresh.types.js";

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

export class PostgresRefreshRepository
implements RefreshRepository {
  public async rotateRefreshToken(
    data: RotateRefreshTokenData,
  ): Promise<RefreshRotationResult> {
    const client =
      await database.connect();

    try {
      await client.query("BEGIN");

      const result =
        await client
          .query<RefreshCredentialRow>(
            `
              SELECT
                rt.id AS token_id,
                rt.session_id,
                rt.family_id,
                rt.expires_at
                  AS token_expires_at,
                rt.used_at,
                s.user_id,
                s.expires_at
                  AS session_expires_at,
                s.revoked_at,
                u.email
              FROM refresh_tokens rt
              INNER JOIN sessions s
                ON s.id = rt.session_id
              INNER JOIN users u
                ON u.id = s.user_id
              WHERE rt.token_hash = $1
              FOR UPDATE OF rt, s
            `,
            [
              data.currentTokenHash,
            ],
          );

      const credential =
        result.rows[0];

      if (credential === undefined) {
        await client.query("COMMIT");

        return {
          status: "invalid",
        };
      }

      const now = new Date();

      if (
        credential.revoked_at !== null ||
        credential.session_expires_at <=
          now ||
        credential.token_expires_at <=
          now
      ) {
        await client.query("COMMIT");

        return {
          status: "invalid",
        };
      }

      /*
       * A used token being presented again indicates
       * token reuse. Revoke the complete session.
       */
      if (credential.used_at !== null) {
        await client.query(
          `
            UPDATE sessions
            SET revoked_at =
              COALESCE(
                revoked_at,
                CURRENT_TIMESTAMP
              )
            WHERE id = $1
          `,
          [
            credential.session_id,
          ],
        );

        await client.query("COMMIT");

        return {
          status: "reused",
          sessionId:
            credential.session_id,
          userId:
            credential.user_id,
        };
      }

      /*
       * Insert the next token before marking
       * the current token as used.
       */
      await client.query(
        `
          INSERT INTO refresh_tokens (
            id,
            session_id,
            family_id,
            token_hash,
            expires_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5
          )
        `,
        [
          data.nextTokenId,
          credential.session_id,
          credential.family_id,
          data.nextTokenHash,
          data.nextExpiresAt,
        ],
      );

      const updateResult =
        await client.query(
          `
            UPDATE refresh_tokens
            SET
              used_at =
                CURRENT_TIMESTAMP,
              replaced_by_token_id =
                $1
            WHERE
              id = $2
              AND used_at IS NULL
          `,
          [
            data.nextTokenId,
            credential.token_id,
          ],
        );

      if (updateResult.rowCount !== 1) {
        throw new Error(
          "Refresh token rotation update failed",
        );
      }

      /*
       * Sliding session expiration:
       * successful rotation extends the session.
       */
      await client.query(
        `
          UPDATE sessions
          SET expires_at = $1
          WHERE id = $2
        `,
        [
          data.nextExpiresAt,
          credential.session_id,
        ],
      );

      await client.query("COMMIT");

      return {
        status: "rotated",

        session: {
          userId:
            credential.user_id,

          email:
            credential.email,

          sessionId:
            credential.session_id,
        },
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}