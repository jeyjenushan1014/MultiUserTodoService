import type {
  ErrorResponse,
  RegisterAccountRequest,
  RegisterAccountResponse,
  LoginAccountRequest,
  LoginAccountResponse,
  RefreshSessionRequest,
  RefreshSessionResponse
} from "@todo/contracts";

import {
  AppError,
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


async function sendAccountRequest<T>(
  path: string,
  request: unknown,
  requestId: string,
): Promise<T> {
  const abortController =
    new AbortController();

  const timeout = setTimeout(
    () => {
      abortController.abort();
    },
    env.DOWNSTREAM_TIMEOUT_MS,
  );

  timeout.unref();

  try {
    const response = await fetch(
      new URL(
        path,
        env.ACCOUNT_SERVICE_URL,
      ),
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",

          "x-request-id":
            requestId,

          "x-internal-service-key":
            env.INTERNAL_SERVICE_SECRET,
        },

        body:
          JSON.stringify(request),

        signal:
          abortController.signal,
      },
    );

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
  return sendAccountRequest<
    RegisterAccountResponse
  >(
    "/internal/v1/accounts/register",
    request,
    requestId,
  );
}


export async function loginAccount(
  request: LoginAccountRequest,
  requestId: string,
): Promise<LoginAccountResponse> {
  return sendAccountRequest<
    LoginAccountResponse
  >(
    "/internal/v1/auth/login",
    request,
    requestId,
  );
}

export async function refreshSession(
  request: RefreshSessionRequest,
  requestId: string,
): Promise<RefreshSessionResponse> {
  return sendAccountRequest<
    RefreshSessionResponse
  >(
    "/internal/v1/auth/refresh",
    request,
    requestId,
  );
}