import type {
  PoolClient,
} from "pg";

import {
  database,
} from "../../../config/database.js";

import type {
  LoginRepository,
} from "./login.repository.interface.js";

import type {
  CreateSessionData,
  LoginUserRow,
} from "./login.types.js";

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

export class PostgresLoginRepository
implements LoginRepository {
  public async findUserByEmail(
    email: string,
  ): Promise<LoginUserRow | undefined> {
    const result =
      await database.query<LoginUserRow>(
        `
          SELECT
            id,
            email,
            password_hash
          FROM users
          WHERE email = $1
            AND NOT EXISTS (
              SELECT 1 FROM account_deletion_requests
              WHERE user_id = users.id
                AND status IN ('pending', 'running')
            )
          LIMIT 1
        `,
        [
          email,
        ],
      );

    return result.rows[0];
  }

  public async createSession(
    data: CreateSessionData,
  ): Promise<boolean> {
    const client =
      await database.connect();

    try {
      await client.query("BEGIN");

      const eligibleAccount = await client.query<{ id: string }>(
        `SELECT id FROM users
         WHERE id = $1
           AND NOT EXISTS (
             SELECT 1 FROM account_deletion_requests
             WHERE user_id = users.id AND status IN ('pending', 'running')
           )
         FOR UPDATE`,
        [data.userId],
      );
      if (eligibleAccount.rowCount !== 1) {
        await client.query("COMMIT");
        return false;
      }

      await client.query(
        `
          INSERT INTO sessions (
            id,
            user_id,
            expires_at
          )
          VALUES (
            $1,
            $2,
            $3
          )
        `,
        [
          data.sessionId,
          data.userId,
          data.sessionExpiresAt,
        ],
      );

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
          data.refreshTokenId,
          data.sessionId,
          data.familyId,
          data.refreshTokenHash,
          data.refreshTokenExpiresAt,
        ],
      );

      await client.query("COMMIT");
      return true;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}