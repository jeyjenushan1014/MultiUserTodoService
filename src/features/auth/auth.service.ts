import bcrypt from "bcrypt";
import { AppError } from "../../shared/app-error.js";
import * as authRepository from "./auth.repository.js";
import type {
  PublicUser,
  UserDatabaseRow,
} from "./auth.types.js";

function toPublicUser(
  user: UserDatabaseRow,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
  };
}

function isPostgreSQLUniqueViolation(
  error: unknown,
): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if (!("code" in error)) {
    return false;
  }

  return (
    (error as { code?: string }).code === "23505"
  );
}

export async function register(
  email: string,
  password: string,
): Promise<PublicUser> {
  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await authRepository.createUser(
      email,
      passwordHash,
    );

    return toPublicUser(user);
  } catch (error) {
    if (isPostgreSQLUniqueViolation(error)) {
      throw new AppError(
        409,
        "EMAIL_ALREADY_EXISTS",
        "An account with this email already exists",
      );
    }

    throw error;
  }
}

