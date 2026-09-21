import type {
  PoolClient,
} from "pg";

import type {
  AccountRegisteredEvent,
  RegisteredAccount,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import type {
  RegistrationRepository,
} from "./registration.repository.interface.js";

import type {
  CreateAccountData,
  UserDatabaseRow,
} from "./registration.types.js";

import { logger } from "../../../config/logger.js";

async function rollback(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (error: unknown) {
    logger.error(
      { err: error },
      "Failed to rollback database transaction",
    );
  }
}

export class PostgresRegistrationRepository
implements RegistrationRepository {
  public async createAccount(
    data: CreateAccountData,
  ): Promise<RegisteredAccount> {
    const client =
      await database.connect();

    try {
      await client.query("BEGIN");

      const userResult =
        await client.query<UserDatabaseRow>(
          `
            INSERT INTO users (
              id,
              email,
              password_hash,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $4
            )
            RETURNING
              id,
              email,
              password_hash,
              created_at,
              updated_at
          `,
          [
            data.id,
            data.email,
            data.passwordHash,
            data.createdAt,
          ],
        );

      const user =
        userResult.rows[0];

      if (user === undefined) {
        throw new Error(
          "User insert returned no row",
        );
      }

      const event:
        AccountRegisteredEvent = {
          eventId: data.eventId,
          eventType:
            "account.registered",
          eventVersion: 1,
          occurredAt:
            data.createdAt.toISOString(),
          requestId:
            data.requestId,
          producer:
            "account-service",
          payload: {
            userId: user.id,
            email: user.email,
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
    JSON.stringify(event),
    event.requestId,
    data.createdAt,
  ],
);

      await client.query("COMMIT");

      return {
        id: user.id,
        email: user.email,
        createdAt:
          user.created_at.toISOString(),
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}