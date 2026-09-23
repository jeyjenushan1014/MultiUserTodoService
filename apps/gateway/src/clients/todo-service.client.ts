import type {
  CallerIdentity,
  CreateTodoRequest,
  CreateTodoResponse,
  ErrorResponse,
  GetTodoResponse,
  InternalIdentityEnvelope,
  ListTodosQuery,
  ListTodosResponse,
  UpdateTodoRequest,
  UpdateTodoResponse,
  ShareTodoResponse,
  CreateTodoShareRequest
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
Checks whether an unknown value is a plain
object-like value.

Arrays technically satisfy typeof === "object",
but they are not expected for the response shapes
validated by this helper.
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
Validates the common downstream error format.

This prevents unsafe direct access to an unknown
response body.
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
Detects the error produced when the downstream
request timeout aborts fetch().
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
Returns undefined when:

- the response has no JSON content type;
- the response contains no body;
- JSON parsing fails.

A DELETE operation may correctly return 204 with
no response body.
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
Creates a short-lived, signed caller identity.

The structure remains flattened so existing TODO
Service code can continue using:

identity.userId
identity.email
identity.sessionId
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
        "todo-service",

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

interface TodoRequestOptions {
  readonly method:
    | "GET"
    | "POST"
    | "PATCH"
    | "DELETE";

  readonly endpoint:
    URL;

  readonly requestId:
    string;

  readonly identity:
    CallerIdentity;

  readonly body?:
    unknown;
}

/*
Creates the headers required for a trusted internal
request.

The old internal service key is retained during this
transition because the current TODO Service middleware
may still verify it.

It will be removed only after the receiving middleware
has been updated and tested against signed envelopes.
*/
function createRequestHeaders(
  options:
    TodoRequestOptions,
): Record<string, string> {
  const headers:
    Record<string, string> = {
      "x-request-id":
        options.requestId,

      "x-internal-service-key":
        env.INTERNAL_SERVICE_SECRET,

      ...createIdentityHeaders(
        options.identity,
        options.requestId,
      ),
    };

  if (options.body !== undefined) {
    headers["content-type"] =
      "application/json";
  }

  return headers;
}

/*
Sends a request to TODO Service.

This function centralizes:

- timeout handling;
- trusted identity headers;
- request-ID propagation;
- JSON parsing;
- downstream error mapping;
- network failure handling.
*/
async function sendTodoRequest<T>(
  options:
    TodoRequestOptions,
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
   * With exactOptionalPropertyTypes enabled,
   * body: undefined must not be assigned.
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
        options.endpoint,
        requestInit,
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
          responseBody.error.code,
          responseBody.error.message,
          responseBody.error.details,
        );
      }

      throw new AppError(
        502,
        "INVALID_DOWNSTREAM_RESPONSE",
        "TODO service returned an invalid response",
      );
    }

    /*
     * A successful DELETE operation normally
     * returns 204 with no response body.
     */
    if (
      response.status === 204
    ) {
      return undefined;
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

/*
POST /internal/v1/todos
*/
export async function createTodo(
  request:
    CreateTodoRequest,
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<CreateTodoResponse> {
  const endpoint =
    new URL(
      "/internal/v1/todos",
      env.TODO_SERVICE_URL,
    );

  const result =
    await sendTodoRequest<
      CreateTodoResponse
    >({
      method:
        "POST",

      endpoint,

      identity,

      requestId,

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
      "TODO service returned an invalid response",
    );
  }

  return result;
}

/*
GET /internal/v1/todos
*/
export async function listTodos(
  query:
    ListTodosQuery,
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<ListTodosResponse> {
  const endpoint =
    new URL(
      "/internal/v1/todos",
      env.TODO_SERVICE_URL,
    );

  endpoint.searchParams.set(
    "page",
    String(
      query.page,
    ),
  );

  endpoint.searchParams.set(
    "pageSize",
    String(
      query.pageSize,
    ),
  );

  if (
    query.state !== undefined
  ) {
    endpoint.searchParams.set(
      "state",
      query.state,
    );
  }

  endpoint.searchParams.set(
    "sortBy",
    query.sortBy,
  );

  endpoint.searchParams.set(
    "sortOrder",
    query.sortOrder,
  );

  const result =
    await sendTodoRequest<
      ListTodosResponse
    >({
      method:
        "GET",

      endpoint,

      identity,

      requestId,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "TODO service returned an invalid response",
    );
  }

  return result;
}

/*
GET /internal/v1/todos/:todoId
*/
export async function getTodoById(
  todoId:
    string,
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<GetTodoResponse> {
  const endpoint =
    new URL(
      `/internal/v1/todos/${
        encodeURIComponent(
          todoId,
        )
      }`,
      env.TODO_SERVICE_URL,
    );

  const result =
    await sendTodoRequest<
      GetTodoResponse
    >({
      method:
        "GET",

      endpoint,

      identity,

      requestId,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "TODO service returned an invalid response",
    );
  }

  return result;
}

/*
PATCH /internal/v1/todos/:todoId
*/
export async function updateTodo(
  todoId:
    string,
  body:
    UpdateTodoRequest,
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<UpdateTodoResponse> {
  const endpoint =
    new URL(
      `/internal/v1/todos/${
        encodeURIComponent(
          todoId,
        )
      }`,
      env.TODO_SERVICE_URL,
    );

  const result =
    await sendTodoRequest<
      UpdateTodoResponse
    >({
      method:
        "PATCH",

      endpoint,

      identity,

      requestId,

      body,
    });

  if (
    result === undefined ||
    !isRecord(result)
  ) {
    throw new AppError(
      502,
      "INVALID_DOWNSTREAM_RESPONSE",
      "TODO service returned an invalid response",
    );
  }

  return result;
}

/*
DELETE /internal/v1/todos/:todoId
*/
export async function deleteTodoById(
  todoId:
    string,
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<void> {
  const endpoint =
    new URL(
      `/internal/v1/todos/${
        encodeURIComponent(
          todoId,
        )
      }`,
      env.TODO_SERVICE_URL,
    );

  await sendTodoRequest<
    undefined
  >({
    method:
      "DELETE",

    endpoint,

    identity,

    requestId,
  });
}

/*
POST /internal/v1/todos/:todoId/shares
*/
export async function shareTodo(
  todoId:
    string,
  request:
    CreateTodoShareRequest,
  identity:
    CallerIdentity,
  requestId:
    string,
): Promise<ShareTodoResponse> {
  const endpoint =
    new URL(
      `/internal/v1/todos/${
        encodeURIComponent(
          todoId,
        )
      }/shares`,
      env.TODO_SERVICE_URL,
    );

  const result =
    await sendTodoRequest<
      ShareTodoResponse
    >({
      method:
        "POST",

      endpoint,

      identity,

      requestId,

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
      "TODO service returned an invalid response",
    );
  }

  return result;
}