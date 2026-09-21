import {
  database,
} from "../../../config/database.js";

import type {
  ProfileRepository,
} from "./profile.repository.interface.js";

import type {
  CurrentAccountRow,
} from "./profile.types.js";

export class PostgresProfileRepository
implements ProfileRepository {
  public async findActiveAccount(
    userId: string,
    sessionId: string,
  ): Promise<
    CurrentAccountRow | undefined
  > {
    const result =
      await database
        .query<CurrentAccountRow>(
          `
            SELECT
              u.id,
              u.email,
              u.created_at,
              u.updated_at
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
}