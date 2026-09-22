import type {
  PoolClient,
} from "pg";

import type {
  AccountPasswordResetRequestedPayload,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import type {
  CreatePasswordResetData,
  PasswordResetUser,
} from "./password-reset.types.js";

import type {
  PasswordResetRepository,
} from "./password-reset.repository.interface.js";

interface PasswordResetUserRow {
  readonly id: string;
  readonly email: string;
}

export class PostgresPasswordResetRepository
implements PasswordResetRepository {
  public async findActiveUserByEmail(
    email: string,
  ): Promise<PasswordResetUser | undefined> {
    const result =
      await database.query<PasswordResetUserRow>(
        `
          SELECT
            id,
            email
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
        `,
        [email],
      );

    const row = result.rows[0];

    if (row === undefined) {
      return undefined;
    }

    return {
      id: row.id,
      email: row.email,
    };
  }

  public async createPasswordReset(
    data: CreatePasswordResetData,
  ): Promise<void> {
    const client =
      await database.connect();

    try {
      await client.query("BEGIN");

      await this.invalidatePreviousTokens(
        client,
        data.userId,
        data.occurredAt,
      );

      await this.insertResetToken(
        client,
        data,
      );

      await this.insertOutboxEvent(
        client,
        data,
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");

      throw error;
    } finally {
      client.release();
    }
  }

  private async invalidatePreviousTokens(
    client: PoolClient,
    userId: string,
    occurredAt: Date,
  ): Promise<void> {
    await client.query(
      `
        UPDATE password_reset_tokens
        SET used_at = $2
        WHERE user_id = $1
          AND used_at IS NULL
      `,
      [
        userId,
        occurredAt,
      ],
    );
  }

  private async insertResetToken(
    client: PoolClient,
    data: CreatePasswordResetData,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO password_reset_tokens (
          id,
          user_id,
          token_hash,
          expires_at,
          created_at
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
        data.tokenId,
        data.userId,
        data.tokenHash,
        data.expiresAt,
        data.occurredAt,
      ],
    );
  }

  private async insertOutboxEvent(
    client: PoolClient,
    data: CreatePasswordResetData,
  ): Promise<void> {
    const payload:
      AccountPasswordResetRequestedPayload = {
        userId: data.userId,
        email: data.email,
        resetToken: data.resetToken,
        expiresAt:
          data.expiresAt.toISOString(),
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
          $9
        )
      `,
      [
        data.eventId,
        "account",
        data.userId,
        "account.password-reset-requested",
        1,
        JSON.stringify(payload),
        data.requestId,
        data.occurredAt,
        0,
      ],
    );
  }
}