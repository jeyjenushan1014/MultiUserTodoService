import type {
  Request,
} from "express";

import type {
  InternalIdentityEnvelope,
} from "@todo/contracts";

import {
  AppError,
  decodeIdentity,
  verifyIdentitySignature,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

const MAX_IDENTITY_AGE_MS =
  30_000;

export function requireInternalIdentity(
  request: Request,
): InternalIdentityEnvelope {
  const encodedIdentity =
    request.header(
      "x-internal-identity",
    );

  const signature =
    request.header(
      "x-internal-signature",
    );

  if (
    encodedIdentity === undefined ||
    signature === undefined ||
    !verifyIdentitySignature(
      encodedIdentity,
      signature,
      env.INTERNAL_SERVICE_SECRET,
    )
  ) {
    throw new AppError(
      401,
      "INTERNAL_IDENTITY_INVALID",
      "Internal identity authentication failed",
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
      "INTERNAL_IDENTITY_INVALID",
      "Internal identity authentication failed",
    );
  }

  const age =
    Date.now() -
    identity.issuedAt;

  if (
    age < -5_000 ||
    age > MAX_IDENTITY_AGE_MS
  ) {
    throw new AppError(
      401,
      "INTERNAL_IDENTITY_EXPIRED",
      "Internal identity authentication failed",
    );
  }

  const requestId =
    request.header(
      "x-request-id",
    );

  if (
    requestId === undefined ||
    identity.requestId !==
      requestId
  ) {
    throw new AppError(
      401,
      "INTERNAL_IDENTITY_INVALID",
      "Internal identity authentication failed",
    );
  }

  return identity;
}