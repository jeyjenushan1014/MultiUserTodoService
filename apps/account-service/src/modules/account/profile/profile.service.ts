import type {
  CurrentAccount,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  ProfileRepository,
} from "./profile.repository.interface.js";

export class ProfileService {
  public constructor(
    private readonly repository:
      ProfileRepository,
  ) {}

  public async getCurrentAccount(
    userId: string,
    sessionId: string,
  ): Promise<CurrentAccount> {
    const account =
      await this.repository
        .findActiveAccount(
          userId,
          sessionId,
        );

    if (account === undefined) {
      throw new AppError(
        401,
        "SESSION_INVALID",
        "Session is invalid or expired",
      );
    }

    return {
      id: account.id,
      email: account.email,
      createdAt:
        account.created_at
          .toISOString(),
      updatedAt:
        account.updated_at
          .toISOString(),
    };
  }
}