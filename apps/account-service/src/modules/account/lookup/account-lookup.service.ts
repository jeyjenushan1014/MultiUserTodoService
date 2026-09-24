import type {
  ResolveAccountResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  AccountLookupRepository,
} from "./account-lookup.repository.interface.js";

export class AccountLookupService {
  public constructor(
    private readonly repository:
      AccountLookupRepository,
  ) {}

  public async execute(
    normalizedEmail:
      string,
  ): Promise<
    ResolveAccountResponse
  > {
    const account =
      await this.repository
        .findByEmail(
          normalizedEmail,
        );

    if (
      account === undefined
    ) {
      throw new AppError(
        404,
        "ACCOUNT_NOT_FOUND",
        "The requested account was not found",
      );
    }

    return {
      data: {
        account,
      },
    };
  }
}