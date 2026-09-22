import type {
  PoolClient,
} from "pg";

import {
  database,
} from "../config/database.js";

import type {
  ApplyOwnerProjectionData,
  ApplyOwnerProjectionResult,
  OwnerProjectionRepository,
} from "./owner-projection.repository.interface.js";

export class PostgresOwnerProjectionRepository
implements OwnerProjectionRepository {
  public async applyAccountRegistered(
    data: ApplyOwnerProjectionData,
  ): Promise<ApplyOwnerProjectionResult> {
    const client =
      await database.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const eventInserted =
        await this.insertProcessedEvent(
          client,
          data,
        );

      if (!eventInserted) {
        await client.query(
          "COMMIT",
        );

        return "duplicate";
      }

      await this.insertOwner(
        client,
        data,
      );

      await client.query(
        "COMMIT",
      );

      return "applied";
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      throw error;
    } finally {
      client.release();
    }
  }

  private async insertProcessedEvent(
    client: PoolClient,
    data: ApplyOwnerProjectionData,
  ): Promise<boolean> {
    const result =
      await client.query(
        `
          INSERT INTO processed_events (
            event_id,
            event_type,
            consumer_name,
            occurred_at,
            processed_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (event_id)
          DO NOTHING
          RETURNING event_id
        `,
        [
          data.eventId,
          data.eventType,
          data.consumerName,
          data.occurredAt,
        ],
      );

    return result.rowCount === 1;
  }

  private async insertOwner(
    client: PoolClient,
    data: ApplyOwnerProjectionData,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO todo_owners (
          id,
          account_created_at,
          created_at,
          deactivated_at
        )
        VALUES (
          $1,
          $2,
          CURRENT_TIMESTAMP,
          NULL
        )
        ON CONFLICT (id)
        DO UPDATE
        SET
          account_created_at =
            LEAST(
              todo_owners.account_created_at,
              EXCLUDED.account_created_at
            ),
          deactivated_at = NULL
      `,
      [
        data.userId,
        data.occurredAt,
      ],
    );
  }
}