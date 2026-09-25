/*
Verifies the signed caller identity sent by the
Gateway to authenticated Account Service operations.

The internal service-key middleware runs before the
controller. This file verifies the additional caller
identity used by operations such as:

- logout;
- logout all;
- current profile;
- change email.
*/

import type {
  Request,
  RequestHandler,
} from "express";

import type {
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

const ALLOWED_CLOCK_SKEW_SECONDS =
  5;

const INTERNAL_IDENTITY_HEADER =
  "x-internal-identity";

const INTERNAL_SIGNATURE_HEADER =
  "x-internal-signature";

/*
Creates the generic invalid-identity error.

The response does not reveal whether the signature,
issuer, audience or request-ID binding was invalid.
*/
function createInvalidIdentityError():
  AppError {
  return new AppError(
    401,
    "INTERNAL_IDENTITY_INVALID",
    "Internal identity authentication failed",
  );
}

/*
Creates the expired-identity error.

The message remains generic and does not expose
identity details.
*/
function createExpiredIdentityError():
  AppError {
  return new AppError(
    401,
    "INTERNAL_IDENTITY_EXPIRED",
    "Internal identity authentication failed",
  );
}

/*
Reads one required internal identity header.
*/
function getRequiredHeader(
  request:
    Request,
  headerName:
    string,
): string {
  const value =
    request.header(
      headerName,
    );

  if (
    value === undefined ||
    value.length === 0
  ) {
    throw createInvalidIdentityError();
  }

  return value;
}

/*
Verifies the service-specific metadata after the
signature and structure have been verified.
*/
function validateIdentityMetadata(
  identity:
    InternalIdentityEnvelope,
): void {
  const currentTimeSeconds =
    Math.floor(
      Date.now() / 1000,
    );



  /*
   * An identity created for TODO Service cannot be
   * reused against Account Service.
   */
  if (
    identity.audience !==
    "account-service"
  ) {
    throw createInvalidIdentityError();
  }

  /*
   * The request ID inside the signed identity must
   * match the request context created before the
   * controller executes.
   */
  const currentRequestId =
    getRequestId();

  if (
    currentRequestId === undefined ||
    identity.requestId !==
      currentRequestId
  ) {
    throw createInvalidIdentityError();
  }

  /*
   * Allow only a small clock difference between
   * Gateway and Account Service.
   */
  if (
    identity.issuedAt >
    currentTimeSeconds +
      ALLOWED_CLOCK_SKEW_SECONDS
  ) {
    throw createInvalidIdentityError();
  }

  /*
   * The identity is expired when expiresAt equals
   * or precedes the current time.
   */
  if (
    identity.expiresAt <=
    currentTimeSeconds
  ) {
    throw createExpiredIdentityError();
  }

  const identityLifetimeSeconds =
    identity.expiresAt -
    identity.issuedAt;

  /*
   * Even a correctly signed identity must not have
   * an unexpectedly long validity period.
   */
  if (
    identityLifetimeSeconds <= 0 ||
    identityLifetimeSeconds >
      env
        .INTERNAL_IDENTITY_MAX_AGE_SECONDS
  ) {
    throw createInvalidIdentityError();
  }

  /*
   * This additional age check rejects old identities
   * even if their expiry was constructed incorrectly.
   */
  const identityAgeSeconds =
    currentTimeSeconds -
    identity.issuedAt;

  if (
    identityAgeSeconds >
    env
      .INTERNAL_IDENTITY_MAX_AGE_SECONDS
  ) {
    throw createExpiredIdentityError();
  }
}

/*
Verifies and returns the authenticated caller identity
envelope.

This function remains synchronous because all its
operations are local CPU/memory operations:

- read headers;
- verify HMAC;
- decode Base64URL;
- parse JSON;
- validate metadata.
*/
export function requireInternalIdentity(
  request:
    Request,
): InternalIdentityEnvelope {
  const encodedIdentity =
    getRequiredHeader(
      request,
      INTERNAL_IDENTITY_HEADER,
    );

  const signature =
    getRequiredHeader(
      request,
      INTERNAL_SIGNATURE_HEADER,
    );

  const signatureValid =
    verifyIdentitySignature(
      encodedIdentity,
      signature,
      env.INTERNAL_SERVICE_SECRET,
    );

  if (!signatureValid) {
    throw createInvalidIdentityError();
  }

  let identity:
    InternalIdentityEnvelope;

  try {
    /*
     * decodeIdentity() now performs runtime
     * structural validation.
     */
    identity =
      decodeIdentity(
        encodedIdentity,
      );
  } catch {
    throw createInvalidIdentityError();
  }

  validateIdentityMetadata(
    identity,
  );

  return identity;
}

export const requireInternalIdentityMiddleware:
  RequestHandler = (
    request,
    _response,
    next,
  ): void => {
    try {
      requireInternalIdentity(
        request,
      );

      next();
    } catch (error) {
      next(error);
    }
  };