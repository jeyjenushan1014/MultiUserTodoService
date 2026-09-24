import {
  randomUUID,
} from "node:crypto";

import type {
  RefreshSessionResponse,
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
  logger,
} from "../../../config/logger.js";

import {
  createAccessToken,
} from "../../../security/access-token.service.js";

import type {
  RefreshRepository,
} from "./refresh.repository.interface.js";

import type {
  RefreshSessionInput,
} from "./refresh.validation.js";

const INVALID_REFRESH_TOKEN =
  new AppError(
    401,
    "INVALID_REFRESH_TOKEN",
    "Refresh token is invalid or expired",
  );

function expiresAfter(
  seconds: number,
): Date {
  return new Date(
    Date.now() +
      seconds * 1000,
  );
}

export class RefreshService {
  public constructor(
    private readonly repository:
      RefreshRepository,
  ) {}

  public async refresh(
    input: RefreshSessionInput,
  ): Promise<RefreshSessionResponse> {
    const currentTokenHash =
      hashOpaqueToken(
        input.refreshToken,
      );

    const nextRefreshToken =
      createOpaqueToken();

    const nextTokenHash =
      hashOpaqueToken(
        nextRefreshToken,
      );

    const rotation =
      await this.repository
        .rotateRefreshToken({
          currentTokenHash,
          nextTokenId:
            randomUUID(),
          nextTokenHash,
          nextExpiresAt:
            expiresAfter(
              env
                .REFRESH_TOKEN_TTL_SECONDS,
            ),
        });

    if (rotation.status === "invalid") {
      throw INVALID_REFRESH_TOKEN;
    }

    if (rotation.status === "reused") {
      logger.warn(
        {
          userId:
            rotation.userId,
          sessionId:
            rotation.sessionId,
        },
        "Refresh token reuse detected; session revoked",
      );

      throw INVALID_REFRESH_TOKEN;
    }

    const accessToken =
      await createAccessToken({
        userId:
          rotation.session.userId,

        sessionId:
          rotation.session.sessionId,

        email:
          rotation.session.email,
      });

    return {
      data: {
        accessToken,
        refreshToken:
          nextRefreshToken,

        accessTokenExpiresIn:
          env.ACCESS_TOKEN_TTL_SECONDS,

        refreshTokenExpiresIn:
          env
            .REFRESH_TOKEN_TTL_SECONDS,
      },
    };
  }
}