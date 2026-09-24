import {
  randomUUID,
} from "node:crypto";

import type {
  PasswordResetRequestedResponse,
} from "@todo/contracts";

import {
  AppError,
  createOpaqueToken,
  hashOpaqueToken,
} from "@todo/common";

import {
  env,
} from "../../../config/env.js";

import type {
  PasswordHasher,
} from "../../../security/password-hasher.js";

import type {
  PasswordResetRepository,
} from "./password-reset.repository.interface.js";

export interface RequestPasswordResetCommand {
  readonly email: string;
  readonly requestId: string;
}

export interface ConfirmPasswordResetCommand {
  readonly token: string;
  readonly newPassword: string;
  readonly requestId: string;
}

export class PasswordResetService {
  public constructor(
    private readonly repository:
      PasswordResetRepository,

    private readonly passwordHasher:
      PasswordHasher,
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

  public async confirmReset(
    command: ConfirmPasswordResetCommand,
  ): Promise<void> {
    const tokenHash =
      hashOpaqueToken(
        command.token,
      );

    /*
     Hash the password before opening the database
     transaction. Bcrypt is intentionally expensive,
     so it should not keep a PostgreSQL row lock open.
    */
    const newPasswordHash =
      await this.passwordHasher.hash(
        command.newPassword,
      );

    const result =
      await this.repository
        .completePasswordReset({
          tokenHash,
          newPasswordHash,
          occurredAt: new Date(),
          requestId:
            command.requestId,
          eventId: randomUUID(),
        });

    if (!result.completed) {
      throw new AppError(
        400,
        "INVALID_PASSWORD_RESET_TOKEN",
        "The password reset token is invalid or has expired",
      );
    }
  }

  private createGenericResponse():
    PasswordResetRequestedResponse {
    return {
      message:
        "If an account exists for this email, password reset instructions will be sent",
    };
  }
}