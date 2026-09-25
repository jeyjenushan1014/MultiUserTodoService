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
  getRequestId,
} from "@todo/common";

import {
  getCurrentAccount,
} from "../clients/account-service.client.js";

import {
  extractBearerToken,
  verifyAccessTokenClaims,
} from "../security/access-token-claims.js";

export interface AuthenticationLocals {
  callerIdentity?: CallerIdentity;
}

interface AuthenticateOptions {
  readonly allowAccountServiceUnavailable?: boolean;
}

async function authenticateRequest(
  request: Request,
  response: Response<
    unknown,
    AuthenticationLocals
  >,
  options: AuthenticateOptions,
): Promise<void> {
  const token =
    extractBearerToken(request);

  const claims =
    await verifyAccessTokenClaims(token);

  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new AppError(
      500,
      "REQUEST_CONTEXT_UNAVAILABLE",
      "Request context is unavailable",
    );
  }

  try {
    await getCurrentAccount(
      claims,
      requestId,
    );
  } catch (error) {
    if (
      error instanceof AppError &&
      error.statusCode === 401
    ) {
      throw new AppError(
        401,
        "INVALID_ACCESS_TOKEN",
        "The access token is invalid or expired",
      );
    }

    if (
      options.allowAccountServiceUnavailable ===
        true &&
      error instanceof AppError &&
      (
        error.statusCode === 503 ||
        error.statusCode === 504
      )
    ) {
      /*
       * Read-only TODO views can continue from
       * verified JWT claims while Account Service
       * is unavailable. Writes remain fail-closed.
       */
    } else {
      throw error;
    }
  }

  response.locals.callerIdentity = {
    userId: claims.userId,
    sessionId: claims.sessionId,
    email: claims.email,
  };
}

function createAuthenticateMiddleware(
  options: AuthenticateOptions = {},
): RequestHandler {
  return (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    void authenticateRequest(
      request,
      response,
      options,
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

export const authenticateTodoRead =
  createAuthenticateMiddleware({
    allowAccountServiceUnavailable: true,
  });

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