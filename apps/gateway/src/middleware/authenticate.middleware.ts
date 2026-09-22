import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

import {
  jwtVerify,
} from "jose";

import type {
  CallerIdentity,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

export interface AuthenticationLocals {
  callerIdentity?: CallerIdentity;
}

interface AccessTokenClaims {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
}

const jwtSecret =
  new TextEncoder().encode(
    env.JWT_SECRET,
  );

function extractBearerToken(
  request: Request,
): string {
  const authorization =
    request.header("authorization");

  if (authorization === undefined) {
    throw new AppError(
      401,
      "AUTHENTICATION_REQUIRED",
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
      "INVALID_AUTHORIZATION_HEADER",
      "Authorization header must use the Bearer scheme",
    );
  }

  return token;
}

async function verifyAccessToken(
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

async function authenticateRequest(
  request: Request,
  response: Response<
    unknown,
    AuthenticationLocals
  >,
): Promise<void> {
  const token =
    extractBearerToken(request);

  const claims =
    await verifyAccessToken(token);

  response.locals.callerIdentity = {
    userId: claims.userId,
    sessionId: claims.sessionId,
    email: claims.email,
  };
}

export const authenticate:
  RequestHandler = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    void authenticateRequest(
      request,
      response,
    )
      .then(() => {
        next();
      })
      .catch(
        (error: unknown) => {
          next(error);
        },
      );
  };

export function getCallerIdentity(
  response: Response,
): CallerIdentity {
  const locals =
    response.locals as Record<
      string,
      unknown
    >;

  const value =
    locals.callerIdentity;

  if (
    typeof value !== "object" ||
    value === null
  ) {
    throw new AppError(
      500,
      "AUTHENTICATION_CONTEXT_MISSING",
      "Authentication context is unavailable",
    );
  }

  const identity =
    value as Record<string, unknown>;

  if (
    typeof identity.userId !== "string" ||
    typeof identity.sessionId !== "string" ||
    typeof identity.email !== "string"
  ) {
    throw new AppError(
      500,
      "AUTHENTICATION_CONTEXT_INVALID",
      "Authentication context is invalid",
    );
  }

  return {
    userId: identity.userId,
    sessionId: identity.sessionId,
    email: identity.email,
  };
}