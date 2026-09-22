import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  CallerIdentity,
  InternalIdentityEnvelope,
} from "@todo/contracts";

import {
  AppError,
  decodeIdentity,
  getRequestId,
  verifyIdentitySignature,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

export interface InternalIdentityLocals {
  callerIdentity?:
    CallerIdentity;
}

type IdentityResponse<
  ResponseBody = unknown,
> =
  Response<
    ResponseBody,
    InternalIdentityLocals
  >;

function getRequiredHeader(
  request: Request,
  name: string,
): string {
  const value =
    request.header(name);

  if (
    value === undefined ||
    value.length === 0
  ) {
    throw new AppError(
      401,
      "UNAUTHORIZED_INTERNAL_REQUEST",
      "Internal request authentication failed",
    );
  }

  return value;
}

function verifyIssuedAt(
  issuedAt: number,
): boolean {
  const currentSeconds =
    Math.floor(
      Date.now() / 1000,
    );

  const ageSeconds =
    currentSeconds -
    issuedAt;

  return (
    ageSeconds >= 0 &&
    ageSeconds <=
      env
        .INTERNAL_IDENTITY_MAX_AGE_SECONDS
  );
}

function verifyRequestId(
  identity:
    InternalIdentityEnvelope,
): boolean {
  const requestId =
    getRequestId();

  return (
    requestId !== undefined &&
    identity.requestId ===
      requestId
  );
}

export function requireInternalIdentity(
  request: Request,
  response: IdentityResponse,
  next: NextFunction,
): void {
  try {
    const serviceKey =
      getRequiredHeader(
        request,
        "x-internal-service-key",
      );

    if (
      serviceKey !==
      env.INTERNAL_SERVICE_SECRET
    ) {
      throw new AppError(
        401,
        "UNAUTHORIZED_INTERNAL_REQUEST",
        "Internal request authentication failed",
      );
    }

    const encodedIdentity =
      getRequiredHeader(
        request,
        "x-internal-identity",
      );

    const signature =
      getRequiredHeader(
        request,
        "x-internal-signature",
      );

    const signatureValid =
      verifyIdentitySignature(
        encodedIdentity,
        signature,
        env.INTERNAL_SERVICE_SECRET,
      );

    if (!signatureValid) {
      throw new AppError(
        401,
        "UNAUTHORIZED_INTERNAL_REQUEST",
        "Internal request authentication failed",
      );
    }

    let identity:
      InternalIdentityEnvelope;

    try {
      identity =
        decodeIdentity(
          encodedIdentity,
        );
    } catch {
      throw new AppError(
        401,
        "UNAUTHORIZED_INTERNAL_REQUEST",
        "Internal request authentication failed",
      );
    }

    if (
      !verifyIssuedAt(
        identity.issuedAt,
      ) ||
      !verifyRequestId(
        identity,
      )
    ) {
      throw new AppError(
        401,
        "UNAUTHORIZED_INTERNAL_REQUEST",
        "Internal request authentication failed",
      );
    }

    response.locals
      .callerIdentity = {
        userId:
          identity.userId,

        sessionId:
          identity.sessionId,

        email:
          identity.email,
      };

    next();
  } catch (error) {
    next(error);
  }
}

export function getInternalCallerIdentity<
  ResponseBody,
>(
  response: IdentityResponse<ResponseBody>,
): CallerIdentity {
  const identity =
    response.locals
      .callerIdentity;

  if (identity === undefined) {
    throw new AppError(
      500,
      "INTERNAL_IDENTITY_MISSING",
      "An unexpected error occurred",
    );
  }

  return identity;
}