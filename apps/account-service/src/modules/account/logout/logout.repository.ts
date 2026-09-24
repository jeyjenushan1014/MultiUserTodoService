import {
  database,
} from "../../../config/database.js";

import type {
  LogoutRepository,
} from "./logout.repository.interface.js";

export class PostgresLogoutRepository
implements LogoutRepository {
  public async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<boolean> {
    const result =
      await database.query(
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
        `,
        [
          sessionId,
          userId,
        ],
      );

    return result.rowCount === 1;
  }

  public async revokeAllSessions(
    userId: string,
  ): Promise<number> {
    const result =
      await database.query(
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
          userId,
        ],
      );

    return result.rowCount ?? 0;
  }
}