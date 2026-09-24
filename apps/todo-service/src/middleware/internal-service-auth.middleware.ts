/*
Protects internal TODO Service routes.

The middleware verifies:

1. the internal service key;
2. the HMAC identity signature;
3. the decoded identity structure;
4. the Gateway issuer;
5. the TODO Service audience;
6. the trusted request-ID binding;
7. the identity issue time;
8. the identity expiry;
9. the maximum permitted identity lifetime.

After successful verification, the authenticated
caller is stored in response.locals.callerIdentity.
*/

import {
  timingSafeEqual,
} from "node:crypto";

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

/*
Allows a small difference between the clocks of the
Gateway and TODO Service containers.

An identity issued more than five seconds in the
future is rejected.
*/
const ALLOWED_CLOCK_SKEW_SECONDS =
  5;

const INTERNAL_SERVICE_KEY_HEADER =
  "x-internal-service-key";

const INTERNAL_IDENTITY_HEADER =
  "x-internal-identity";

const INTERNAL_SIGNATURE_HEADER =
  "x-internal-signature";

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

/*
Creates one generic authentication error.

The API must not reveal whether authentication failed
because of:

- missing headers;
- wrong service key;
- invalid signature;
- invalid audience;
- expired identity;
- request-ID mismatch.
*/
function createAuthenticationError():
  AppError {
  return new AppError(
    401,
    "UNAUTHORIZED_INTERNAL_REQUEST",
    "Internal request authentication failed",
  );
}

/*
Reads one required internal HTTP header.
*/
function getRequiredHeader(
  request:
    Request,
  name:
    string,
): string {
  const value =
    request.header(
      name,
    );

  if (
    value === undefined ||
    value.length === 0
  ) {
    throw createAuthenticationError();
  }

  return value;
}

/*
Compares the supplied internal service key using a
timing-safe comparison.

A normal string comparison such as:

supplied === expected

may expose a small timing difference.
*/
function secretsMatch(
  suppliedSecret:
    string,
  expectedSecret:
    string,
): boolean {
  const suppliedBuffer =
    Buffer.from(
      suppliedSecret,
      "utf8",
    );

  const expectedBuffer =
    Buffer.from(
      expectedSecret,
      "utf8",
    );

  if (
    suppliedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    suppliedBuffer,
    expectedBuffer,
  );
}

/*
Checks whether the identity issue time is acceptable.

The issued-at value uses Unix seconds, not
milliseconds.
*/
function verifyIssuedAt(
  issuedAt:
    number,
  currentTimeSeconds:
    number,
): boolean {
  return (
    issuedAt <=
      currentTimeSeconds +
        ALLOWED_CLOCK_SKEW_SECONDS &&

    currentTimeSeconds -
      issuedAt <=
      env
        .INTERNAL_IDENTITY_MAX_AGE_SECONDS
  );
}

/*
Checks whether the signed identity has expired.
*/
function verifyExpiry(
  expiresAt:
    number,
  currentTimeSeconds:
    number,
): boolean {
  return (
    expiresAt >
    currentTimeSeconds
  );
}

/*
Prevents the Gateway from accidentally creating an
identity whose validity period is longer than the
receiving service permits.
*/
function verifyIdentityLifetime(
  identity:
    InternalIdentityEnvelope,
): boolean {
  const lifetimeSeconds =
    identity.expiresAt -
    identity.issuedAt;

  return (
    lifetimeSeconds > 0 &&
    lifetimeSeconds <=
      env
        .INTERNAL_IDENTITY_MAX_AGE_SECONDS
  );
}

/*
Binds the signed identity to the current HTTP request
context.

The request-context middleware must execute before
this authentication middleware.
*/
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

/*
Verifies security metadata after:

1. signature verification;
2. decoding;
3. structural runtime validation.
*/
function verifyIdentityMetadata(
  identity:
    InternalIdentityEnvelope,
): boolean {
  const currentTimeSeconds =
    Math.floor(
      Date.now() / 1000,
    );

  return (


    identity.audience ===
      "todo-service" &&

    verifyRequestId(
      identity,
    ) &&

    verifyIssuedAt(
      identity.issuedAt,
      currentTimeSeconds,
    ) &&

    verifyExpiry(
      identity.expiresAt,
      currentTimeSeconds,
    ) &&

    verifyIdentityLifetime(
      identity,
    )
  );
}

/*
Authenticates a signed internal Gateway request.

Keep this exported function name because the existing
TODO router already depends on it.
*/
export function requireInternalIdentity(
  request:
    Request,
  response:
    IdentityResponse,
  next:
    NextFunction,
): void {
  try {
    const serviceKey =
      getRequiredHeader(
        request,
        INTERNAL_SERVICE_KEY_HEADER,
      );

    if (
      !secretsMatch(
        serviceKey,
        env.INTERNAL_SERVICE_SECRET,
      )
    ) {
      throw createAuthenticationError();
    }

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
      throw createAuthenticationError();
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
      throw createAuthenticationError();
    }

    if (
      !verifyIdentityMetadata(
        identity,
      )
    ) {
      throw createAuthenticationError();
    }

    /*
     * Only expose caller fields to controllers.
     *
     * The controller does not need issuer,
     * audience, timestamps or signature details.
     */
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

/*
Returns the verified caller identity to controllers.

Controllers must never obtain ownerId from the
request body, query parameters or public headers.
*/
export function getInternalCallerIdentity<
  ResponseBody,
>(
  response:
    IdentityResponse<
      ResponseBody
    >,
): CallerIdentity {
  const identity =
    response.locals
      .callerIdentity;

  if (
    identity === undefined
  ) {
    throw new AppError(
      500,
      "INTERNAL_IDENTITY_MISSING",
      "An unexpected error occurred",
    );
  }

  return identity;
}