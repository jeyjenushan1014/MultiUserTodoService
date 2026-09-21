import {
  randomUUID,
} from "node:crypto";

import type {
  RegisteredAccount,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  PasswordHasher,
} from "../../../security/password-hasher.js";

import type {
  RegistrationRepository,
} from "./registration.repository.interface.js";

import type {
  RegistrationInput,
} from "./registration.validation.js";

interface PostgreSqlError {
  readonly code?: unknown;
  readonly constraint?: unknown;
}

function isObject(
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
  if (!isObject(error)) {
    return false;
  }

  const databaseError =
    error as PostgreSqlError;

  return databaseError.code === "23505";
}

export class RegistrationService {
  public constructor(
    private readonly repository:
      RegistrationRepository,

    private readonly passwordHasher:
      PasswordHasher,
  ) {}

  public async register(
    input: RegistrationInput,
    requestId: string,
  ): Promise<RegisteredAccount> {
    const normalizedEmail =
      input.email
        .trim()
        .toLowerCase();

    const passwordHash =
      await this.passwordHasher.hash(
        input.password,
      );

    const occurredAt =
      new Date();

    try {
      return await this
        .repository
        .createAccount({
          id: randomUUID(),
          email: normalizedEmail,
          passwordHash,
          createdAt: occurredAt,
          requestId,
          eventId: randomUUID(),
        });
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