import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

import type {
  CallerIdentity,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import {
  extractBearerToken,
  verifyAccessTokenClaims,
} from "../security/access-token-claims.js";

import {
  isSessionRevoked,
} from "../security/session-revocation.cache.js";

export interface AuthenticationLocals {
  callerIdentity?: CallerIdentity;
  accessTokenIssuedAt?: number;
}

export interface AuthenticatedCallerIdentity extends CallerIdentity {
  readonly accessTokenIssuedAt: number;
}

/*
 * Authorization no longer requires a synchronous call to Account
 * Service: revocation is learned asynchronously via
 * account.session-revoked and cached locally in Redis (see
 * session-revocation.consumer.ts and session-revocation.cache.ts).
 * Stopping Account Service no longer affects any authenticated
 * request, reads or writes.
 */
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
    await verifyAccessTokenClaims(token);

  if (await isSessionRevoked(claims)) {
    throw new AppError(
      401,
      "INVALID_ACCESS_TOKEN",
      "The access token is invalid or expired",
    );
  }

  response.locals.callerIdentity = {
    userId: claims.userId,
    sessionId: claims.sessionId,
    email: claims.email,
  };
  response.locals.accessTokenIssuedAt = claims.issuedAt;
}

function createAuthenticateMiddleware():
  RequestHandler {
  return (
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
}

export const authenticate =
  createAuthenticateMiddleware();

/*
 * Reads and writes now use the same check; kept as a separate
 * export so call sites do not need to change.
 */
export const authenticateTodoRead =
  authenticate;

export function getCallerIdentity(
  response: Response,
): AuthenticatedCallerIdentity {
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

  const accessTokenIssuedAt = locals.accessTokenIssuedAt;

  if (typeof accessTokenIssuedAt !== "number" || !Number.isInteger(accessTokenIssuedAt)) {
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
    accessTokenIssuedAt,
  };
}