import {
  randomUUID,
} from "node:crypto";

import type {
  LoginAccountResponse,
} from "@todo/contracts";

import {
  AppError,
  createOpaqueToken,
  hashOpaqueToken,
} from "@todo/common";

import {
  env,
} from "../../../config/env.js";

import {
  createAccessToken,
} from "../../../security/access-token.service.js";

import type {
  PasswordVerifier,
} from "../../../security/password-hasher.js";

import type {
  LoginRepository,
} from "./login.repository.interface.js";

import type {
  LoginInput,
} from "./login.validation.js";

const INVALID_CREDENTIALS =
  new AppError(
    401,
    "INVALID_CREDENTIALS",
    "Email or password is incorrect",
  );

function addSeconds(
  date: Date,
  seconds: number,
): Date {
  return new Date(
    date.getTime() +
      seconds * 1000,
  );
}

export class LoginService {
  public constructor(
    private readonly repository:
      LoginRepository,

    private readonly passwordVerifier:
      PasswordVerifier,
  ) {}

  public async login(
    input: LoginInput,
  ): Promise<LoginAccountResponse> {
    const normalizedEmail =
      input.email
        .trim()
        .toLowerCase();

    const user =
      await this.repository
        .findUserByEmail(
          normalizedEmail,
        );

    if (user === undefined) {
      throw INVALID_CREDENTIALS;
    }

    const passwordIsValid =
      await this.passwordVerifier
        .verify(
          input.password,
          user.password_hash,
        );

    if (!passwordIsValid) {
      throw INVALID_CREDENTIALS;
    }

    const now = new Date();
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refreshTokenId =
      randomUUID();

    const refreshToken =
      createOpaqueToken();

    const refreshTokenHash =
      hashOpaqueToken(
        refreshToken,
      );

    const sessionExpiresAt =
      addSeconds(
        now,
        env.REFRESH_TOKEN_TTL_SECONDS,
      );

    const refreshTokenExpiresAt =
      addSeconds(
        now,
        env.REFRESH_TOKEN_TTL_SECONDS,
      );

    const accessToken =
      await createAccessToken({
        userId: user.id,
        sessionId,
        email: user.email,
      });

    await this.repository
      .createSession({
        sessionId,
        familyId,
        refreshTokenId,
        userId: user.id,
        refreshTokenHash,
        sessionExpiresAt,
        refreshTokenExpiresAt,
      });



    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
        },

        accessToken,
        refreshToken,

        accessTokenExpiresIn:
          env.ACCESS_TOKEN_TTL_SECONDS,

        refreshTokenExpiresIn:
          env.REFRESH_TOKEN_TTL_SECONDS,
      },
    };
  }
}