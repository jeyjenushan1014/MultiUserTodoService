import type {
  PoolClient,
} from "pg";

import {
  database,
} from "../config/database.js";

import type {
  ApplyOwnerProjectionData,
  ApplyOwnerProjectionResult,
  OwnerProjectionRebuildResult,
  OwnerProjectionRebuildUser,
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

      await this.deleteAppliedPendingEmail(
        client,
        data.userId,
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

  public async applyAccountEmailChanged(
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

      await client.query(
        `
          INSERT INTO todo_owner_pending_email_changes (
            user_id,
            email,
            occurred_at,
            event_id
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id)
          DO UPDATE
          SET
            email = EXCLUDED.email,
            occurred_at = EXCLUDED.occurred_at,
            event_id = EXCLUDED.event_id
          WHERE todo_owner_pending_email_changes.occurred_at < EXCLUDED.occurred_at
        `,
        [
          data.userId,
          data.email,
          data.occurredAt,
          data.eventId,
        ],
      );

      await client.query(
        `
          UPDATE todo_owners AS owners
          SET
            email = pending.email,
            deactivated_at = NULL,
            projection_occurred_at = pending.occurred_at
          FROM todo_owner_pending_email_changes AS pending
          WHERE owners.id = pending.user_id
            AND pending.user_id = $1
            AND owners.projection_occurred_at < pending.occurred_at
        `,
        [
          data.userId,
        ],
      );

      await this.deleteAppliedPendingEmail(
        client,
        data.userId,
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

  public async startRebuild(
    rebuildId: string,
  ): Promise<void> {
    await database.query(
      `
        INSERT INTO todo_owner_projection_rebuilds (id)
        VALUES ($1)
        ON CONFLICT (id) DO NOTHING
      `,
      [rebuildId],
    );
  }

  public async applyRebuildBatch(
    rebuildId: string,
    users: readonly OwnerProjectionRebuildUser[],
  ): Promise<OwnerProjectionRebuildResult> {
    if (users.length === 0) {
      return { upserted: 0, alreadyPresent: 0 };
    }

    const client = await database.connect();

    try {
      await client.query("BEGIN");

      const rebuild = await client.query(
        `
          SELECT id
          FROM todo_owner_projection_rebuilds
          WHERE id = $1
            AND completed_at IS NULL
          FOR UPDATE
        `,
        [rebuildId],
      );

      if (rebuild.rowCount !== 1) {
        throw new Error("Owner projection rebuild is missing or complete");
      }

      let upserted = 0;
      let alreadyPresent = 0;

      for (const user of users) {
        const member = await client.query(
          `
            INSERT INTO todo_owner_projection_rebuild_members (
              rebuild_id,
              user_id
            )
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            RETURNING user_id
          `,
          [rebuildId, user.userId],
        );

        if (member.rowCount === 1) {
          upserted += 1;
        } else {
          alreadyPresent += 1;
        }

        await client.query(
          `
            INSERT INTO todo_owners (
              id,
              email,
              account_created_at,
              created_at,
              deactivated_at,
              projection_occurred_at
            )
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, NULL, $4)
            ON CONFLICT (id)
            DO UPDATE SET
              email = CASE
                WHEN todo_owners.projection_occurred_at <= EXCLUDED.projection_occurred_at
                  THEN EXCLUDED.email
                ELSE todo_owners.email
              END,
              account_created_at = LEAST(
                todo_owners.account_created_at,
                EXCLUDED.account_created_at
              ),
              deactivated_at = CASE
                WHEN todo_owners.projection_occurred_at <= EXCLUDED.projection_occurred_at
                  THEN NULL
                ELSE todo_owners.deactivated_at
              END,
              projection_occurred_at = GREATEST(
                todo_owners.projection_occurred_at,
                EXCLUDED.projection_occurred_at
              )
          `,
          [
            user.userId,
            user.email,
            user.accountCreatedAt,
            user.projectionOccurredAt,
          ],
        );
      }

      await client.query("COMMIT");

      return { upserted, alreadyPresent };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async completeRebuild(
    rebuildId: string,
  ): Promise<number> {
    const client = await database.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `
          UPDATE todo_owners AS owners
          SET deactivated_at = CURRENT_TIMESTAMP
          WHERE owners.deactivated_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM todo_owner_projection_rebuild_members AS members
              WHERE members.rebuild_id = $1
                AND members.user_id = owners.id
            )
        `,
        [rebuildId],
      );

      await client.query(
        `
          UPDATE todo_owner_projection_rebuilds
          SET completed_at = CURRENT_TIMESTAMP
          WHERE id = $1
            AND completed_at IS NULL
        `,
        [rebuildId],
      );

      await client.query("COMMIT");

      return result.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async deleteAppliedPendingEmail(
    client: PoolClient,
    userId: string,
  ): Promise<void> {
    await client.query(
      `
        DELETE FROM todo_owner_pending_email_changes AS pending
        USING todo_owners AS owners
        WHERE pending.user_id = owners.id
          AND pending.user_id = $1
          AND pending.occurred_at <= owners.projection_occurred_at
      `,
      [
        userId,
      ],
    );
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
    const pendingResult =
      await client.query<{
        readonly email: string;
        readonly occurred_at: Date;
      }>(
        `
          SELECT
            email,
            occurred_at
          FROM todo_owner_pending_email_changes
          WHERE user_id = $1
          FOR UPDATE
        `,
        [
          data.userId,
        ],
      );

    const pending =
      pendingResult.rows[0];

    const email =
      pending !== undefined &&
      pending.occurred_at > data.occurredAt
        ? pending.email
        : data.email;

    const projectionOccurredAt =
      pending !== undefined &&
      pending.occurred_at > data.occurredAt
        ? pending.occurred_at
        : data.occurredAt;

    await client.query(
      `
        INSERT INTO todo_owners (
          id,
          email,
          account_created_at,
          created_at,
          deactivated_at,
          projection_occurred_at
        )
        VALUES (
          $1,
          $2,
          $3,
          CURRENT_TIMESTAMP,
          NULL,
          $4
        )
        ON CONFLICT (id)
        DO UPDATE
        SET
          email = CASE
            WHEN todo_owners.projection_occurred_at < EXCLUDED.projection_occurred_at
              THEN EXCLUDED.email
            ELSE todo_owners.email
          END,
          account_created_at = LEAST(
            todo_owners.account_created_at,
            EXCLUDED.account_created_at
          ),
          deactivated_at = CASE
            WHEN todo_owners.projection_occurred_at < EXCLUDED.projection_occurred_at
              THEN NULL
            ELSE todo_owners.deactivated_at
          END,
          projection_occurred_at = GREATEST(
            todo_owners.projection_occurred_at,
            EXCLUDED.projection_occurred_at
          )
      `,
      [
        data.userId,
        email,
        data.occurredAt,
        projectionOccurredAt,
      ],
    );
  }
}
