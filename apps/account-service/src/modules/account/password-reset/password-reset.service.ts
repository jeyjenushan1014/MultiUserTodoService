import {
  randomUUID,
} from "node:crypto";

import type {
  PasswordResetRequestedResponse,
} from "@todo/contracts";

import {
  createOpaqueToken,
  hashOpaqueToken,
} from "@todo/common";

import {
  env,
} from "../../../config/env.js";

import type {
  PasswordResetRepository,
} from "./password-reset.repository.interface.js";

export interface RequestPasswordResetCommand {
  readonly email: string;
  readonly requestId: string;
}

export class PasswordResetService {
  public constructor(
    private readonly repository:
      PasswordResetRepository,
  ) {}

  public async requestReset(
    command: RequestPasswordResetCommand,
  ): Promise<PasswordResetRequestedResponse> {
    const normalizedEmail =
      command.email
        .trim()
        .toLowerCase();

    const user =
      await this.repository
        .findActiveUserByEmail(
          normalizedEmail,
        );

    /*
     Never reveal whether the account exists.
     This prevents email/account enumeration.
    */
    if (user === undefined) {
      return this.createGenericResponse();
    }

    const resetToken =
      createOpaqueToken();

    const tokenHash =
      hashOpaqueToken(resetToken);

    const occurredAt =
      new Date();

    const expiresAt =
      new Date(
        occurredAt.getTime() +
        env.PASSWORD_RESET_TOKEN_TTL_MINUTES *
          60 *
          1000,
      );

    await this.repository
      .createPasswordReset({
        tokenId: randomUUID(),
        eventId: randomUUID(),
        userId: user.id,
        email: user.email,
        resetToken,
        tokenHash,
        occurredAt,
        expiresAt,
        requestId:
          command.requestId,
      });

    return this.createGenericResponse();
  }

  private createGenericResponse():
    PasswordResetRequestedResponse {
    return {
      message:
        "If an account exists for this email, password reset instructions will be sent",
    };
  }
}