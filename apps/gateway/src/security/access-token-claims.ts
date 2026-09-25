import type {
  Request,
} from "express";

import {
  jwtVerify,
} from "jose";

import {
  AppError,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

export interface AccessTokenClaims {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
}

const jwtSecret =
  new TextEncoder().encode(
    env.JWT_SECRET,
  );

/*
 * Single JWT parsing/verification implementation shared by every
 * authentication path in the gateway, so there is one error vocabulary
 * (401 INVALID_ACCESS_TOKEN) instead of one per call site.
 */
export function extractBearerToken(
  request: Request,
): string {
  const authorization =
    request.header("authorization");

  if (authorization === undefined) {
    throw new AppError(
      401,
      "INVALID_ACCESS_TOKEN",
      "An access token is required",
    );
  }

  const match =
    /^Bearer\s+(\S+)$/i.exec(
      authorization.trim(),
    );

  const token =
    match?.[1];

  if (token === undefined) {
    throw new AppError(
      401,
      "INVALID_ACCESS_TOKEN",
      "Authorization header must use the Bearer scheme",
    );
  }

  return token;
}

export async function verifyAccessTokenClaims(
  token: string,
): Promise<AccessTokenClaims> {
  try {
    const verificationResult =
      await jwtVerify(
        token,
        jwtSecret,
        {
          algorithms: [
            "HS256",
          ],

          issuer:
            env.JWT_ISSUER,

          audience:
            env.JWT_AUDIENCE,

          clockTolerance: 5,
        },
      );

    const userId =
      verificationResult.payload.sub;

    const sessionId =
      verificationResult.payload.sid;

    const email =
      verificationResult.payload.email;

    if (
      typeof userId !== "string" ||
      userId.length === 0 ||
      typeof sessionId !== "string" ||
      sessionId.length === 0 ||
      typeof email !== "string" ||
      email.length === 0
    ) {
      throw new Error(
        "Required access-token claims are missing",
      );
    }

    return {
      userId,
      sessionId,
      email,
    };
  } catch {
    /*
     * Do not expose whether expiry, signature,
     * issuer, audience or claims caused the failure.
     */
    throw new AppError(
      401,
      "INVALID_ACCESS_TOKEN",
      "The access token is invalid or expired",
    );
  }
}
