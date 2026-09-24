import {
  randomUUID,
} from "node:crypto";

import type {
  ChangeEmailResponse,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  PasswordVerifier,
} from "../../../security/password-hasher.js";

import type {
  EmailChangeRepository,
} from "./email-change.repository.interface.js";

import type {
  ChangeEmailInput,
} from "./email-change.validation.js";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isUniqueViolation(
  error: unknown,
): boolean {
  return (
    isRecord(error) &&
    error.code === "23505"
  );
}

export class EmailChangeService {
  public constructor(
    private readonly repository:
      EmailChangeRepository,

    private readonly passwordVerifier:
      PasswordVerifier,
  ) {}

  public async changeEmail(
    userId: string,
    sessionId: string,
    requestId: string,
    input: ChangeEmailInput,
  ): Promise<ChangeEmailResponse> {
    const credential =
      await this.repository
        .findActiveCredential(
          userId,
          sessionId,
        );

    if (credential === undefined) {
      throw new AppError(
        401,
        "SESSION_INVALID",
        "Session is invalid or expired",
      );
    }

    const passwordIsValid =
      await this.passwordVerifier
        .verify(
          input.currentPassword,
          credential.password_hash,
        );

    if (!passwordIsValid) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Current password is incorrect",
      );
    }

    const normalizedEmail =
      input.email
        .trim()
        .toLowerCase();

    if (
      normalizedEmail ===
      credential.email
    ) {
      throw new AppError(
        409,
        "EMAIL_UNCHANGED",
        "New email must be different from the current email",
      );
    }

    try {
      const user =
        await this.repository
          .changeEmail({
            userId,
            email:
              normalizedEmail,
            eventId:
              randomUUID(),
            requestId,
            occurredAt:
              new Date(),
          });

      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            updatedAt:
              user.updated_at
                .toISOString(),
          },

          reauthenticationRequired:
            true,
        },
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          "EMAIL_ALREADY_REGISTERED",
          "An account with this email already exists",
        );
      }

      throw error;
    }
  }
}