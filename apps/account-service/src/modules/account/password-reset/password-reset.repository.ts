import type {
  PoolClient,
} from "pg";



import type {
  AccountPasswordResetRequestedPayload,
  AccountPasswordResetCompletedPayload
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import type {
  CreatePasswordResetData,
  PasswordResetUser,
  CompletePasswordResetData,
  CompletePasswordResetResult
} from "./password-reset.types.js";

import type {
  PasswordResetRepository,
} from "./password-reset.repository.interface.js";

interface PasswordResetUserRow {
  readonly id: string;
  readonly email: string;
}

interface ValidPasswordResetRow{
  readonly tokenId: string;
  readonly userId: string
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

  public async completePasswordReset(
  data: CompletePasswordResetData,
): Promise<CompletePasswordResetResult> {
  const client =
    await database.connect();

  try {
    await client.query("BEGIN");

    const token =
      await this.lockValidResetToken(
        client,
        data.tokenHash,
        data.occurredAt,
      );

    if (token === undefined) {
      await client.query("ROLLBACK");

      return {
        completed: false,
      };
    }

    await this.updatePassword(
      client,
      token.userId,
      data.newPasswordHash,
      data.occurredAt,
    );

    await this.consumeResetTokens(
      client,
      token.userId,
      data.occurredAt,
    );

    await this.revokeUserSessions(
      client,
      token.userId,
      data.occurredAt,
    );

    await this.insertPasswordResetCompletedEvent(
      client,
      token.userId,
      data,
    );

    await client.query("COMMIT");

    return {
      completed: true,
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
  }

  private async lockValidResetToken(
  client: PoolClient,
  tokenHash: string,
  occurredAt: Date,
): Promise<ValidPasswordResetRow | undefined> {
  const result =
    await client.query<{
      readonly token_id: string;
      readonly user_id: string;
    }>(
      `
        SELECT
          password_reset_tokens.id
            AS token_id,
          password_reset_tokens.user_id
            AS user_id
        FROM password_reset_tokens
        INNER JOIN users
          ON users.id =
            password_reset_tokens.user_id
        WHERE password_reset_tokens.token_hash = $1
          AND password_reset_tokens.used_at IS NULL
          AND password_reset_tokens.expires_at > $2
        LIMIT 1
        FOR UPDATE OF password_reset_tokens
      `,
      [
        tokenHash,
        occurredAt,
      ],
    );

  const row = result.rows[0];

  if (row === undefined) {
    return undefined;
  }

  return {
    tokenId: row.token_id,
    userId: row.user_id,
  };
}

  private async updatePassword(
  client: PoolClient,
  userId: string,
  newPasswordHash: string,
  occurredAt: Date,
): Promise<void> {
  await client.query(
    `
      UPDATE users
      SET
        password_hash = $2,
        updated_at = $3
      WHERE id = $1
    `,
    [
      userId,
      newPasswordHash,
      occurredAt,
    ],
  );
}

private async consumeResetTokens(
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

private async revokeUserSessions(
  client: PoolClient,
  userId: string,
  occurredAt: Date,
): Promise<void> {
  await client.query(
    `
      UPDATE sessions
      SET revoked_at = $2
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [
      userId,
      occurredAt,
    ],
  );
}

private async insertPasswordResetCompletedEvent(
  client: PoolClient,
  userId: string,
  data: CompletePasswordResetData,
): Promise<void> {
  const payload:
    AccountPasswordResetCompletedPayload = {
      userId,
      completedAt:
        data.occurredAt.toISOString(),
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
      userId,
      "account.password-reset-completed",
      1,
      JSON.stringify(payload),
      data.requestId,
      data.occurredAt,
      0,
    ],
  );
}


}