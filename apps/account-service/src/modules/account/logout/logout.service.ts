import {
  logger,
} from "../../../config/logger.js";

import type {
  LogoutRepository,
} from "./logout.repository.interface.js";

export class LogoutService {
  public constructor(
    private readonly repository:
      LogoutRepository,
  ) {}

  public async logout(
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const revoked =
      await this.repository
        .revokeSession(
          userId,
          sessionId,
        );

    logger.info(
      {
        userId,
        sessionId,
        revoked,
      },
      "Current session logout completed",
    );
  }

  public async logoutAll(
    userId: string,
  ): Promise<void> {
    const revokedSessionCount =
      await this.repository
        .revokeAllSessions(
          userId,
        );

    logger.info(
      {
        userId,
        revokedSessionCount,
      },
      "All-session logout completed",
    );
  }
}