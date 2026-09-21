import {
  jwtVerify,
} from "jose";

import type {
  Request,
} from "express";

import type {
  CallerIdentity,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

const secret =
  new TextEncoder()
    .encode(env.JWT_SECRET);

function readBearerToken(
  request: Request,
): string {
  const authorization =
    request.header("authorization");

  if (
    !authorization?.startsWith(
      "Bearer ",
    )
  ) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "A valid access token is required",
    );
  }

  const token =
    authorization
      .slice("Bearer ".length)
      .trim();

  if (token.length === 0) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "A valid access token is required",
    );
  }

  return token;
}

export async function verifyAccessToken(
  request: Request,
): Promise<CallerIdentity> {
  const token =
    readBearerToken(request);

  try {
    const verification =
      await jwtVerify(
        token,
        secret,
        {
          issuer:
            env.JWT_ISSUER,

          audience:
            env.JWT_AUDIENCE,

          algorithms: [
            "HS256",
          ],
        },
      );

    const subject =
      verification.payload.sub;

    const sessionId =
      verification.payload.sid;

    const email =
      verification.payload.email;

    if (
      typeof subject !== "string" ||
      typeof sessionId !== "string" ||
      typeof email !== "string"
    ) {
      throw new Error(
        "Required access-token claims are missing",
      );
    }

    return {
      userId: subject,
      sessionId,
      email,
    };
  } catch {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "A valid access token is required",
    );
  }
}