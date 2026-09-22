import type {
  CallerIdentity,
  CreateTodoRequest,
  CreateTodoResponse,
  ErrorResponse,
  InternalIdentityEnvelope,
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

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name ===
      "AbortError"
  );
}

async function parseJson(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get(
      "content-type",
    );

  if (
    contentType === null ||
    !contentType.includes(
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

function createIdentityHeaders(
  identity: CallerIdentity,
  requestId: string,
): Record<string, string> {
  const envelope:
    InternalIdentityEnvelope = {
      userId:
        identity.userId,

      sessionId:
        identity.sessionId,

      email:
        identity.email,

      requestId,

      issuedAt:
        Math.floor(
          Date.now() / 1000,
        ),
    };

  const encodedIdentity =
    encodeIdentity(
      envelope,
    );

  return {
    "x-internal-identity":
      encodedIdentity,

    "x-internal-signature":
      signIdentity(
        encodedIdentity,
        env
          .INTERNAL_SERVICE_SECRET,
      ),
  };
}

export async function createTodo(
  request: CreateTodoRequest,
  identity: CallerIdentity,
  requestId: string,
): Promise<CreateTodoResponse> {
  const abortController =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        abortController.abort();
      },
      env
        .DOWNSTREAM_TIMEOUT_MS,
    );

  timeout.unref();

  try {
    const response =
      await fetch(
        new URL(
          "/internal/v1/todos",
          env.TODO_SERVICE_URL,
        ),
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json",

            "x-request-id":
              requestId,

            "x-internal-service-key":
              env
                .INTERNAL_SERVICE_SECRET,

            ...createIdentityHeaders(
              identity,
              requestId,
            ),
          },

          body:
            JSON.stringify(
              request,
            ),

          signal:
            abortController.signal,
        },
      );

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
          responseBody
            .error.code,
          responseBody
            .error.message,
          responseBody
            .error.details,
        );
      }

      throw new AppError(
        502,
        "INVALID_DOWNSTREAM_RESPONSE",
        "TODO service returned an invalid response",
      );
    }

    if (
      !isRecord(
        responseBody,
      )
    ) {
      throw new AppError(
        502,
        "INVALID_DOWNSTREAM_RESPONSE",
        "TODO service returned an invalid response",
      );
    }

    return responseBody as
      unknown as
      CreateTodoResponse;
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
        "TODO service did not respond in time",
      );
    }

    throw new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      "TODO service is temporarily unavailable",
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}