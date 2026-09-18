import bcrypt from "bcrypt";
import { AppError } from "../../shared/app-error.js";
import * as authRepository from "./auth.repository.js";
import type {
  PublicUser,
  UserDatabaseRow,
} from "./auth.types.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

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


export interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const user =
    await authRepository.findUserByEmail(email);

  const passwordHash =
    user?.password_hash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEe.8qJBM9G6tePZlJ8QO4I6m2D8x2wzWfK";

  const passwordMatches = await bcrypt.compare(
    password,
    passwordHash,
  );

  if (!user || !passwordMatches) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect",
    );
  }

  const accessToken = jwt.sign(
    {
      email: user.email,
    },
    env.JWT_SECRET,
    {
      subject: user.id,
      algorithm: "HS256",
      expiresIn: env.JWT_EXPIRES_IN_SECONDS,
    },
  );

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
  };
}

export async function getCurrentUser(
  userId: string,
): Promise<PublicUser> {
  const user =
    await authRepository.findUserById(userId);

  if (!user) {
    throw new AppError(
      404,
      "USER_NOT_FOUND",
      "User not found",
    );
  }

  return toPublicUser(user);
}