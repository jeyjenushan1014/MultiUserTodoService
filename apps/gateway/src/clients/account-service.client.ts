import type {
  RegisterAccountRequest,
  RegisterAccountResponse,
  LoginAccountRequest,
  LoginAccountResponse,
  RefreshSessionRequest,
  RefreshSessionResponse,
  CallerIdentity,
  InternalIdentityEnvelope,
  CurrentAccountResponse,
  ErrorResponse,
  ChangeEmailRequest,
  ChangeEmailResponse
} from "@todo/contracts";


import {
  AppError,
  encodeIdentity,
  signIdentity,
} from "@todo/common";



import {
  env,
} from "../config/env.js";



function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isErrorResponse(
  value: unknown,
): value is ErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  const error = value.error;

  if (!isRecord(error)) {
    return false;
  }

  return (
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.requestId === "string"
  );
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

async function parseJson(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get("content-type");

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

interface AccountRequestOptions {
  readonly path: string;
   readonly method:
    | "GET"
    | "POST"
    | "PATCH";
  readonly requestId: string;
  readonly body?: unknown;
  readonly identity?: CallerIdentity;
}

async function sendAccountRequest<T>(
  options: AccountRequestOptions,
): Promise<T | undefined> {
  const abortController =
    new AbortController();

  const timeout = setTimeout(
    () => {
      abortController.abort();
    },
    env.DOWNSTREAM_TIMEOUT_MS,
  );

  timeout.unref();

  const headers:
    Record<string, string> = {
      "content-type":
        "application/json",

      "x-request-id":
        options.requestId,

      "x-internal-service-key":
        env.INTERNAL_SERVICE_SECRET,
    };

  if (options.identity !== undefined) {
    Object.assign(
      headers,
      createIdentityHeaders(
        options.identity,
        options.requestId,
      ),
    );
  }

  try {
    const response = await fetch(
      new URL(
        options.path,
        env.ACCOUNT_SERVICE_URL,
      ),
      {
        method: options.method,
        headers,

        ...(options.body === undefined
          ? {}
          : {
              body:
                JSON.stringify(
                  options.body,
                ),
            }),

        signal:
          abortController.signal,
      },
    );

    if (response.status === 204) {
      return undefined;
    }

    const responseBody =
      await parseJson(response);

    if (!response.ok) {
      if (isErrorResponse(responseBody)) {
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
    if (error instanceof AppError) {
      throw error;
    }

    if (isAbortError(error)) {
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
    clearTimeout(timeout);
  }
}


export async function registerAccount(
  request: RegisterAccountRequest,
  requestId: string,
): Promise<RegisterAccountResponse> {
  const result =
    await sendAccountRequest<
      RegisterAccountResponse
    >({
      path:
        "/internal/v1/accounts/register",
      method: "POST",
      requestId,
      body: request,
    });

  if (result === undefined) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}


export async function loginAccount(
  request: LoginAccountRequest,
  requestId: string,
): Promise<LoginAccountResponse> {
  const result = await sendAccountRequest<
    LoginAccountResponse
  >(
    {
   path: "/internal/v1/auth/login",
   method: "POST",
    requestId,
    body: request
    });

  if (result === undefined) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

export async function refreshSession(
  request: RefreshSessionRequest,
  requestId: string,
): Promise<RefreshSessionResponse> {
   const result = await sendAccountRequest<
    RefreshSessionResponse
  >({
    path:"/internal/v1/auth/refresh",
    method: "POST",
    requestId,
    body: request,
  }
  );
    if (result === undefined) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

function createIdentityHeaders(
  identity: CallerIdentity,
  requestId: string,
): Record<string, string> {
  const envelope:
    InternalIdentityEnvelope = {
      ...identity,
      requestId,
      issuedAt: Date.now(),
    };

  const encodedIdentity =
    encodeIdentity(envelope);

  return {
    "x-internal-identity":
      encodedIdentity,

    "x-internal-signature":
      signIdentity(
        encodedIdentity,
        env.INTERNAL_SERVICE_SECRET,
      ),
  };
}


export async function logoutSession(
  identity: CallerIdentity,
  requestId: string,
): Promise<void> {
  await sendAccountRequest<never>({
    path:
      "/internal/v1/auth/logout",
    method: "POST",
    requestId,
    identity,
  });
}

export async function logoutAllSessions(
  identity: CallerIdentity,
  requestId: string,
): Promise<void> {
  await sendAccountRequest<never>({
    path:
      "/internal/v1/auth/logout-all",
    method: "POST",
    requestId,
    identity,
  });
}

export async function getCurrentAccount(
  identity: CallerIdentity,
  requestId: string,
): Promise<CurrentAccountResponse> {
  const result =
    await sendAccountRequest<
      CurrentAccountResponse
    >({
      path:
        "/internal/v1/accounts/me",

      method: "GET",
      requestId,
      identity,
    });

  if (result === undefined) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}

export async function changeAccountEmail(
  identity: CallerIdentity,
  request: ChangeEmailRequest,
  requestId: string,
): Promise<ChangeEmailResponse> {
  const result =
    await sendAccountRequest<
      ChangeEmailResponse
    >({
      path:
        "/internal/v1/accounts/me/email",

      method: "PATCH",
      requestId,
      identity,
      body: request,
    });

  if (result === undefined) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "Account service returned an invalid response",
    );
  }

  return result;
}