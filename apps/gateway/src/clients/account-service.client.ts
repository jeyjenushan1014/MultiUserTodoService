import type {
  CallerIdentity,
  ChangeEmailRequest,
  ChangeEmailResponse,
  ConfirmPasswordResetRequest,
  CurrentAccountResponse,
  ErrorResponse,
  InternalIdentityEnvelope,
  LoginAccountRequest,
  LoginAccountResponse,
  PasswordResetRequest,
  PasswordResetRequestedResponse,
  RefreshSessionRequest,
  RefreshSessionResponse,
  RegisterAccountRequest,
  RegisterAccountResponse,
} from "@todo/contracts";


import type {
   ResolveAccountRequest,
   ResolveAccountResponse
    } from "@todo/contracts";

import {
  AppError,
  encodeIdentity,
  signIdentity,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

/*
Checks whether an unknown value is an object that
can safely be inspected.

Arrays are rejected because API response objects are
not expected to be arrays at the top level.
*/
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/*
Validates the shared downstream error-response shape.

This protects the client from unsafe property access
on an unknown response body.
*/
function isErrorResponse(
  value: unknown,
): value is ErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  const error =
    value.error;

  if (!isRecord(error)) {
    return false;
  }

  return (
    typeof error.code ===
      "string" &&
    typeof error.message ===
      "string" &&
    typeof error.requestId ===
      "string"
  );
}

/*
Detects an AbortController timeout error produced
by fetch().
*/
function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name ===
      "AbortError"
  );
}

/*
Parses a JSON response without throwing when:

- the response has no JSON content type;
- the response has no body;
- the response body contains malformed JSON.
*/
async function parseJson(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get(
      "content-type",
    );

  if (
    !contentType?.includes(
      "application/json",
    )
  ) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/*
Creates the signed caller identity used by
authenticated Account Service operations.

The identity remains flattened:

envelope.userId
envelope.email
envelope.sessionId

This preserves compatibility with the existing
Account Service identity access pattern.
*/
function createIdentityHeaders(
  identity:
    CallerIdentity,
  requestId:
    string,
): Record<string, string> {
  const issuedAt =
    Math.floor(
      Date.now() / 1000,
    );

  const envelope:
    InternalIdentityEnvelope = {
      issuer:
        "gateway",

      audience:
        "account-service",

      requestId,

      issuedAt,

      expiresAt:
        issuedAt +
        env
          .INTERNAL_IDENTITY_TTL_SECONDS,

      userId:
        identity.userId,

      sessionId:
        identity.sessionId,

      email:
        identity.email,
    };

  const encodedIdentity =
    encodeIdentity(
      envelope,
    );

  const signature =
    signIdentity(
      encodedIdentity,
      env.INTERNAL_SERVICE_SECRET,
    );

  return {
    "x-internal-identity":
      encodedIdentity,

    "x-internal-signature":
      signature,
  };
}

interface AccountRequestOptions {
  readonly path:
    string;

  readonly method:
    | "GET"
    | "POST"
    | "PATCH";

  readonly requestId:
    string;

  readonly body?:
    unknown;

  readonly identity?:
    CallerIdentity;

  readonly requiresServiceKey?:
    boolean;
}

/*
Creates headers for an Account Service request.

The internal service key remains necessary for
service-only operations that do not yet have an
authenticated caller, including:

- registration;
- login;
- refresh;
- password-reset request;
- password-reset confirmation.

Authenticated operations additionally carry a signed
caller identity.
*/
function createRequestHeaders(
  options:
    AccountRequestOptions,
): Record<string, string> {
  const headers:
    Record<string, string> = {
      "x-request-id":
        options.requestId,
    };

  if (
    options.requiresServiceKey ===
    true
  ) {
    headers[
      "x-internal-service-key"
    ] = env.INTERNAL_SERVICE_SECRET;
  }

  if (options.body !== undefined) {
    headers["content-type"] =
      "application/json";
  }

  if (
    options.identity !== undefined
  ) {
    Object.assign(
      headers,
      createIdentityHeaders(
        options.identity,
        options.requestId,
      ),
    );
  }

  return headers;
}

/*
Sends a request to Account Service.

This function centralizes:

- timeout handling;
- service authentication;
- signed caller identity;
- request-ID propagation;
- JSON parsing;
- downstream error mapping;
- network failure handling.
*/
async function sendAccountRequest<T>(
  options:
    AccountRequestOptions,
): Promise<T | undefined> {
  const abortController =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        abortController.abort();
      },
      env.DOWNSTREAM_TIMEOUT_MS,
    );

  timeout.unref();

  const requestInit:
    RequestInit = {
      method:
        options.method,

      headers:
        createRequestHeaders(
          options,
        ),

      signal:
        abortController.signal,
    };

  /*
   * exactOptionalPropertyTypes does not allow
   * assigning body: undefined.
   */
  if (options.body !== undefined) {
    requestInit.body =
      JSON.stringify(
        options.body,
      );
  }

  try {
    const response =
      await fetch(
        new URL(
          options.path,
          env.ACCOUNT_SERVICE_URL,
        ),
        requestInit,
      );

    /*
     * Successful logout and password-reset
     * confirmation operations may return 204.
     */
    if (
      response.status === 204
    ) {
      return undefined;
    }

    const responseBody =
      await parseJson(
        response,
      );

    if (!response.ok) {
      if (
        isErrorResponse(
          responseBody,
        )
      ) {
        throw new AppError(
          response.status,
          responseBody.error.code,
          responseBody.error.message,
          responseBody.error.details,
        );
      }

      throw new AppError(
        502,
        "INVALID_DOWNSTREAM_RESPONSE",
        "Account service returned an invalid response",
      );
    }

    return responseBody as T;
  } catch (error) {
    if (
      error instanceof AppError
    ) {
      throw error;
    }

    if (
      isAbortError(error)
    ) {
      throw new AppError(
        504,
        "DOWNSTREAM_TIMEOUT",
        "Account service did not respond in time",
      );
    }

    throw new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      "Account service is temporarily unavailable",
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/*
POST /internal/v1/accounts/register

No authenticated caller exists yet. The internal
service key authenticates the Gateway.
*/
export async function registerAccount(
  request:
    RegisterAccountRequest,
  requestId:
    string,
): Promise<RegisterAccountResponse> {
  const result =
    await sendAccountRequest<
      RegisterAccountResponse
    >({
      path:
        "/internal/v1/accounts/register",

      method:
        "POST",

      requestId,

      requiresServiceKey:
        true,

      body:
        request,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

/*
POST /internal/v1/auth/login

There is no authenticated caller before login.
*/
export async function loginAccount(
  request:
    LoginAccountRequest,
  requestId:
    string,
): Promise<LoginAccountResponse> {
  const result =
    await sendAccountRequest<
      LoginAccountResponse
    >({
      path:
        "/internal/v1/auth/login",

      method:
        "POST",

      requestId,

      requiresServiceKey:
        true,

      body:
        request,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

/*
POST /internal/v1/auth/refresh

The refresh token is validated by Account Service.
An access-token caller identity is not required.
*/
export async function refreshSession(
  request:
    RefreshSessionRequest,
  requestId:
    string,
): Promise<RefreshSessionResponse> {
  const result =
    await sendAccountRequest<
      RefreshSessionResponse
    >({
      path:
        "/internal/v1/auth/refresh",

      method:
        "POST",

      requestId,

      requiresServiceKey:
        true,

      body:
        request,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

/*
POST /internal/v1/auth/logout

The signed identity identifies the current session.
*/
export async function logoutSession(
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<void> {
  await sendAccountRequest<
    undefined
  >({
    path:
      "/internal/v1/auth/logout",

    method:
      "POST",

    requestId,

    identity,
  });
}

/*
POST /internal/v1/auth/logout-all

The signed identity identifies the authenticated user.
*/
export async function logoutAllSessions(
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<void> {
  await sendAccountRequest<
    undefined
  >({
    path:
      "/internal/v1/auth/logout-all",

    method:
      "POST",

    requestId,

    identity,
  });
}

/*
GET /internal/v1/accounts/me
*/
export async function getCurrentAccount(
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<CurrentAccountResponse> {
  const result =
    await sendAccountRequest<
      CurrentAccountResponse
    >({
      path:
        "/internal/v1/accounts/me",

      method:
        "GET",

      requestId,

      identity,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

/*
PATCH /internal/v1/accounts/me/email
*/
export async function changeAccountEmail(
  identity:
    CallerIdentity,
  request:
    ChangeEmailRequest,
  requestId:
    string,
): Promise<ChangeEmailResponse> {
  const result =
    await sendAccountRequest<
      ChangeEmailResponse
    >({
      path:
        "/internal/v1/accounts/me/email",

      method:
        "PATCH",

      requestId,

      identity,

      body:
        request,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

/*
POST /internal/v1/auth/password-reset/request

This endpoint must not reveal whether an email
address exists.
*/
export async function requestPasswordReset(
  request:
    PasswordResetRequest,
  requestId:
    string,
): Promise<PasswordResetRequestedResponse> {
  const result =
    await sendAccountRequest<
      PasswordResetRequestedResponse
    >({
      method:
        "POST",

      path:
        "/internal/v1/auth/password-reset/request",

      requestId,

      requiresServiceKey:
        true,

      body:
        request,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

/*
POST /internal/v1/auth/password-reset/confirm
*/
export async function confirmPasswordReset(
  request:
    ConfirmPasswordResetRequest,
  requestId:
    string,
): Promise<void> {
  await sendAccountRequest<
    undefined
  >({
    method:
      "POST",

    path:
      "/internal/v1/auth/password-reset/confirm",

    requestId,

    body:
      request,

    requiresServiceKey:
      true,
  });
}
/*
Resolves an account email into the stable Account
Service user identifier.

This is an internal service operation and does not
require a signed caller identity.
*/
export async function resolveAccountByEmail(
  request:
    ResolveAccountRequest,
  requestId:
    string,
): Promise<ResolveAccountResponse> {
  const result =
    await sendAccountRequest<
      ResolveAccountResponse
    >({
      method:
        "POST",

      path:
        "/internal/v1/accounts/resolve",

      requestId,

      body:
        request,

      requiresServiceKey:
        true,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}
