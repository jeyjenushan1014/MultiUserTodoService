import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { decodeJwt } from "jose";

interface ApiResult {
  readonly status: number;
  readonly body: unknown;
  readonly requestId:
    string | null;
}

interface TestUser {
  readonly userId: string;
  readonly email: string;
  readonly password: string;
  readonly accessToken: string;
}

interface TodoRecord {
  readonly id: string;
  readonly version: number;
  readonly ownerId: string;
  readonly title: string;
  readonly description:
    string | null;
  readonly state: string;
  readonly dueDate:
    string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const baseUrl =
  process.env.TODO_E2E_BASE_URL ??
  "http://localhost:3000";

const password =
  "StrongPassword123!";

let userA:
  TestUser;

let userB:
  TestUser;

let userAFirstTodo:
  TodoRecord;

let userASecondTodo:
  TodoRecord;

let userBTodo:
  TodoRecord;



function getString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `Expected ${fieldName} to be a string`,
    );
  }

  return value;
}

function parseTodo(
  value: unknown,
): TodoRecord {
  const responseData =
    getResponseData(value);

  if (!isRecord(responseData)) {
    throw new Error(
      "Expected TODO response object",
    );
  }

  const description =
    responseData.description;

  const dueDate =
    responseData.dueDate;

  const version =
    responseData.version;

  if (
    typeof version !==
      "number" ||
    !Number.isSafeInteger(version) ||
    version < 1
  ) {
    throw new Error(
      "Invalid TODO version",
    );
  }

  if (
    description !== null &&
    typeof description !==
      "string"
  ) {
    throw new Error(
      "Invalid TODO description",
    );
  }

  if (
    dueDate !== null &&
    typeof dueDate !==
      "string"
  ) {
    throw new Error(
      "Invalid TODO due date",
    );
  }

  return {
    id:
      getString(
        responseData.id,
        "TODO id",
      ),

    version,

    ownerId:
      getString(
        responseData.ownerId,
        "TODO ownerId",
      ),

    title:
      getString(
        responseData.title,
        "TODO title",
      ),

    description,

    state:
      getString(
        responseData.state,
        "TODO state",
      ),

    dueDate,

    createdAt:
      getString(
        responseData.createdAt,
        "TODO createdAt",
      ),

    updatedAt:
      getString(
        responseData.updatedAt,
        "TODO updatedAt",
      ),
  };
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function getResponseData(
  value: unknown,
): unknown {
  if (
    isRecord(value) &&
    "data" in value
  ) {
    return value.data;
  }

  return value;
}

function getAccessToken(
  responseBody: unknown,
): string {
  if (!isRecord(responseBody)) {
    throw new Error(
      `Login response is not an object. Response: ${
        JSON.stringify(
          responseBody,
          null,
          2,
        )
      }`,
    );
  }

  const data =
    responseBody.data;

  if (!isRecord(data)) {
    throw new Error(
      `Login response does not contain data. Response: ${
        JSON.stringify(
          responseBody,
          null,
          2,
        )
      }`,
    );
  }

  const accessToken =
    data.accessToken;

  if (
    typeof accessToken !==
      "string" ||
    accessToken.length === 0
  ) {
    throw new Error(
      `Login response does not contain data.accessToken. Response: ${
        JSON.stringify(
          responseBody,
          null,
          2,
        )
      }`,
    );
  }

  return accessToken;
}

function getUserId(
  responseBody: unknown,
): string {
  if (!isRecord(responseBody) || !isRecord(responseBody.data) || !isRecord(responseBody.data.user)) {
    throw new Error("Login response does not contain data.user.id");
  }

  return getString(responseBody.data.user.id, "user id");
}

function getErrorCode(
  value: unknown,
): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const error =
    value.error;

  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code ===
    "string"
    ? error.code
    : undefined;
}

function getErrorMessage(
  value: unknown,
): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const error =
    value.error;

  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.message ===
    "string"
    ? error.message
    : undefined;
}

function getListItems(
  value: unknown,
): readonly TodoRecord[] {
  const responseData =
    getResponseData(value);

  if (
    !isRecord(responseData) ||
    !Array.isArray(
      responseData.items,
    )
  ) {
    throw new Error(
      "Invalid TODO list response",
    );
  }

  return responseData.items.map(
    parseTodo,
  );
}

function getPagination(
  value: unknown,
): Record<string, unknown> {
  const responseData =
    getResponseData(value);

  if (!isRecord(responseData)) {
    throw new Error(
      "Invalid list response",
    );
  }

  const pagination =
    responseData.pagination;

  if (!isRecord(pagination)) {
    throw new Error(
      "Invalid pagination response",
    );
  }

  return pagination;
}

function createRequestId():
  string {
  return crypto.randomUUID();
}

async function wait(
  milliseconds: number,
): Promise<void> {
  await new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

async function request(
  path: string,
  options: {
    readonly method?:
      string;

    readonly accessToken?:
      string;

    readonly body?:
      unknown;

    readonly requestId?:
      string;

    readonly idempotencyKey?:
      string;
  } = {},
): Promise<ApiResult> {
  const requestId =
    options.requestId ??
    createRequestId();

  const headers =
    new Headers();

  headers.set(
    "accept",
    "application/json",
  );

  headers.set(
    "x-request-id",
    requestId,
  );

  if (
    options.accessToken !==
    undefined
  ) {
    headers.set(
      "authorization",
      `Bearer ${options.accessToken}`,
    );
  }

  if (
    options.body !==
    undefined
  ) {
    headers.set(
      "content-type",
      "application/json",
    );
  }

  if (
    options.idempotencyKey !==
    undefined
  ) {
    headers.set(
      "idempotency-key",
      options.idempotencyKey,
    );
  }

  /*
   * With exactOptionalPropertyTypes enabled,
   * RequestInit must not contain body: undefined.
   *
   * The conditional spread completely omits the
   * body property when no request body exists.
   */
  const requestInit:
    RequestInit = {
      method:
        options.method ??
        "GET",

      headers,

      ...(
        options.body ===
        undefined
          ? {}
          : {
              body:
                JSON.stringify(
                  options.body,
                ),
            }
      ),
    };

  const response =
    await fetch(
      new URL(
        path,
        baseUrl,
      ),
      requestInit,
    );

  const contentType =
    response.headers.get(
      "content-type",
    );

  let body:
    unknown = undefined;

  if (
    contentType?.includes(
      "application/json",
    ) === true
  ) {
    body =
      await response.json();
  }

  return {
    status:
      response.status,

    body,

    requestId:
      response.headers.get(
        "x-request-id",
      ),
  };
}

async function registerAndLogin(
  email: string,
): Promise<TestUser> {
  const registration =
    await request(
      "/api/v1/auth/register",
      {
        method:
          "POST",

        body: {
          email,
          password,
        },
      },
    );

  expect(
    registration.status,
  ).toBe(201);

  return login(email);
}

async function login(
  email: string,
): Promise<TestUser> {

  const loginResponse =
    await request(
      "/api/v1/auth/login",
      {
        method:
          "POST",

        body: {
          email,
          password,
        },
      },
    );

  expect(loginResponse.status).toBe(
    200,
  );

  return {
    userId:
      getUserId(loginResponse.body),

    email,
    password,
    accessToken:
      getAccessToken(
        loginResponse.body,
      ),
  };
}

async function createTodo(
  user: TestUser,
  body: {
    readonly title: string;
    readonly description?:
      string | null;
    readonly state?:
      string;
    readonly dueDate?:
      string | null;
  },
  idempotencyKey:
    string = crypto.randomUUID(),
): Promise<ApiResult> {
  return request(
    "/api/v1/todos",
    {
      method:
        "POST",

      accessToken:
        user.accessToken,

      idempotencyKey,

      body,
    },
  );
}

/*
 * RabbitMQ owner projection is asynchronous.
 *
 * Registration can succeed slightly before the
 * account.registered event reaches the TODO Service.
 */
async function createTodoAfterProjection(
  user: TestUser,
  title: string,
): Promise<TodoRecord> {
  const maximumAttempts =
    20;

  const retryDelayMilliseconds =
    1_000;

  let lastStatus =
    0;

  let lastResponseBody:
    unknown;

  /*
   * Every retry belongs to the same logical create
   * operation and must therefore use the same key.
   */
  const idempotencyKey =
    crypto.randomUUID();

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt += 1
  ) {
    const response =
      await createTodo(
        user,
        {
          title,
        },
        idempotencyKey,
      );

    lastStatus =
      response.status;

    lastResponseBody =
      response.body;

    if (response.status === 201) {
      return parseTodo(
        response.body,
      );
    }

    const projectionIsNotReady =
      response.status === 503 &&
      getErrorCode(
        response.body,
      ) ===
        "OWNER_PROJECTION_NOT_READY";

    if (!projectionIsNotReady) {
      throw new Error(
        `Unexpected TODO creation response. Status: ${
          response.status
        }. Response: ${
          JSON.stringify(
            response.body,
            null,
            2,
          )
        }`,
      );
    }

    await wait(
          retryDelayMilliseconds,
        );
      
    
  }

  throw new Error(
    `TODO owner projection was not ready after ${
      maximumAttempts
    } attempts. Last status: ${
      lastStatus
    }. Last response: ${
      JSON.stringify(
        lastResponseBody,
        null,
        2,
      )
    }`,
  );
}

const runE2E =
  process.env.RUN_TODO_E2E ===
  "true";

describe.skipIf(
  !runE2E,
)(
  "Multi-user TODO E2E",
  () => {
    beforeAll(
      async () => {
        const uniqueValue = [
          Date.now(),
          crypto.randomUUID(),
        ].join("-");

        userA =
          await registerAndLogin(
            `todo-e2e-a-${uniqueValue}@example.com`,
          );

        userB =
          await registerAndLogin(
            `todo-e2e-b-${uniqueValue}@example.com`,
          );

        userAFirstTodo =
          await createTodoAfterProjection(
            userA,
            `User A first ${uniqueValue}`,
          );

        userBTodo =
          await createTodoAfterProjection(
            userB,
            `User B first ${uniqueValue}`,
          );
      },
      60_000,
    );

    it(
      "replaces a caller-supplied request ID",
      async () => {
        const requestId =
          createRequestId();

        const result =
          await request(
            "/api/v1/todos",
            {
              accessToken:
                userA.accessToken,

              requestId,
            },
          );

        expect(result.status).toBe(
          200,
        );

        expect(
          result.requestId,
        ).not.toBe(requestId);

        expect(
          result.requestId,
        ).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
        );
      },
    );

    it(
      "rejects a missing access token",
      async () => {
        const result =
          await request(
            "/api/v1/todos",
          );

        expect(result.status).toBe(
          401,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "INVALID_ACCESS_TOKEN",
        );
      },
    );

    it(
      "rejects an invalid access token",
      async () => {
        const result =
          await request(
            "/api/v1/todos",
            {
              accessToken:
                "invalid-token",
            },
          );

        expect(result.status).toBe(
          401,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "INVALID_ACCESS_TOKEN",
        );
      },
    );

    it(
            "allows only one concurrent update for the same task version",
            async () => {
              const uniqueValue = [
                Date.now(),
                crypto.randomUUID(),
              ].join("-");
              const todo =
                await createTodoAfterProjection(
                  userA,
                  `Versioned task ${uniqueValue}`,
                );

              const [first, second] =
                await Promise.all([
                  request(
                    `/api/v1/todos/${todo.id}`,
                    {
                      method:
                        "PATCH",
                      accessToken:
                        userA.accessToken,
                      body: {
                        title:
                          `Concurrent winner A ${uniqueValue}`,
                        expectedVersion:
                          todo.version,
                      },
                    },
                  ),
                  request(
                    `/api/v1/todos/${todo.id}`,
                    {
                      method:
                        "PATCH",
                      accessToken:
                        userA.accessToken,
                      body: {
                        title:
                          `Concurrent winner B ${uniqueValue}`,
                        expectedVersion:
                          todo.version,
                      },
                    },
                  ),
                ]);

              const results = [
                first,
                second,
              ];
              expect(
                results.filter(
                  (result) =>
                    result.status === 200,
                ),
              ).toHaveLength(1);
              expect(
                results.filter(
                  (result) =>
                    result.status === 409 &&
                    getErrorCode(result.body) ===
                      "TODO_VERSION_CONFLICT",
                ),
              ).toHaveLength(1);

              const successfulUpdate =
                results.find(
                  (result) =>
                    result.status === 200,
                );
              expect(successfulUpdate).toBeDefined();
              const updated =
                parseTodo(successfulUpdate?.body);
              expect(updated.version).toBe(
                todo.version + 1,
              );

              const persisted =
                await request(
                  `/api/v1/todos/${todo.id}`,
                  {
                    accessToken:
                      userA.accessToken,
                  },
                );
              expect(persisted.status).toBe(200);
              expect(parseTodo(persisted.body)).toEqual(
                updated,
              );
            },
          );

    it(
      "rejects a TODO request immediately after logout",
      async () => {
        const uniqueValue = [
          Date.now(),
          crypto.randomUUID(),
        ].join("-");

        const user =
          await registerAndLogin(
            `todo-e2e-revocation-${uniqueValue}@example.com`,
          );

        const logout =
          await request(
            "/api/v1/auth/logout",
            {
              method:
                "POST",

              accessToken:
                user.accessToken,
            },
          );

        expect(
          logout.status,
        ).toBe(204);

        const result =
          await request(
            "/api/v1/todos",
            {
              accessToken:
                user.accessToken,
            },
          );

        expect(
          result.status,
        ).toBe(401);

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "INVALID_ACCESS_TOKEN",
        );
      },
    );

    it(
      "revokes a prior token after workspace membership removal and measures propagation latency",
      async () => {
        const originalTokenIssuedAt = decodeJwt(userB.accessToken).iat;
        expect(originalTokenIssuedAt).toBeTypeOf("number");
        await wait(1_100);
        const uniqueValue = `${Date.now()}-${crypto.randomUUID()}`;
        const workspaceResponse = await request("/api/v1/workspaces", {
          method: "POST",
          accessToken: userA.accessToken,
          body: { name: `TN-7 ${uniqueValue}` },
        });
        expect(workspaceResponse.status).toBe(201);
        if (!isRecord(workspaceResponse.body) || !isRecord(workspaceResponse.body.data) || !isRecord(workspaceResponse.body.data.workspace)) {
          throw new Error("Workspace response does not contain data.workspace");
        }
        const workspaceId = getString(workspaceResponse.body.data.workspace.id, "workspace id");

        let ownerProjection: ApiResult | undefined;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          ownerProjection = await request(`/api/v1/workspaces/${workspaceId}`, { accessToken: userA.accessToken });
          if (ownerProjection.status === 200) break;
          await wait(100);
        }
        expect(ownerProjection?.status).toBe(200);

        const addResponse = await request(`/api/v1/workspaces/${workspaceId}/members`, {
          method: "POST",
          accessToken: userA.accessToken,
          body: { userId: userB.userId, role: "administrator" },
        });
        expect(addResponse.status).toBe(204);

        let initialAccess: ApiResult | undefined;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          initialAccess = await request(`/api/v1/workspaces/${workspaceId}`, { accessToken: userB.accessToken });
          if (initialAccess.status === 200) break;
          await wait(100);
        }
        expect(initialAccess?.status).toBe(200);

        const adminAction = await request(`/api/v1/workspaces/${workspaceId}/members`, {
          method: "POST",
          accessToken: userB.accessToken,
          body: { userId: userA.userId, role: "viewer" },
        });
        expect(adminAction.status).toBe(404);

        const roleChange = await request(`/api/v1/workspaces/${workspaceId}/members/${userB.userId}`, {
          method: "PATCH",
          accessToken: userA.accessToken,
          body: { role: "viewer" },
        });
        expect(roleChange.status).toBe(204);

        const roleChangeStartedAt = Date.now();
        let downgradedAction: ApiResult | undefined;
        while (Date.now() - roleChangeStartedAt < 15_000) {
          downgradedAction = await request(`/api/v1/workspaces/${workspaceId}/members`, {
            method: "POST",
            accessToken: userB.accessToken,
            body: { userId: userA.userId, role: "viewer" },
          });
          if (downgradedAction.status === 403) break;
          await wait(100);
        }
        const roleChangeLatencyMs = Date.now() - roleChangeStartedAt;
        expect(downgradedAction?.status).toBe(403);
        expect(getErrorCode(downgradedAction?.body)).toBe("WORKSPACE_ACTION_FORBIDDEN");
        console.info(`TN-7 role-change propagation: ${roleChangeLatencyMs}ms`);

        const removal = await request(`/api/v1/workspaces/${workspaceId}/members/${userB.userId}`, {
          method: "DELETE",
          accessToken: userA.accessToken,
        });
        expect(removal.status).toBe(204);

        const propagationStartedAt = Date.now();
        let deniedAccess: ApiResult | undefined;
        while (Date.now() - propagationStartedAt < 15_000) {
          deniedAccess = await request(`/api/v1/workspaces/${workspaceId}`, { accessToken: userB.accessToken });
          if (deniedAccess.status === 404) break;
          await wait(100);
        }
        const propagationLatencyMs = Date.now() - propagationStartedAt;
        expect(deniedAccess?.status).toBe(404);
        expect(getErrorCode(deniedAccess?.body)).toBe("WORKSPACE_NOT_FOUND");
        expect(propagationLatencyMs).toBeLessThan(15_000);
        console.info(`TN-7 workspace revocation propagation: ${propagationLatencyMs}ms`);
        console.info(`TN-7 original access-token iat: ${originalTokenIssuedAt}`);

        const readd = await request(`/api/v1/workspaces/${workspaceId}/members`, {
          method: "POST",
          accessToken: userA.accessToken,
          body: { userId: userB.userId, role: "administrator" },
        });
        expect(readd.status).toBe(204);

        await wait(1_100);
        const freshReaddedUserB = await login(userB.email);
        const readdedProjection = await request(`/api/v1/workspaces/${workspaceId}/members`, {
          method: "POST",
          accessToken: freshReaddedUserB.accessToken,
          body: { userId: userA.userId, role: "viewer" },
        });
        expect(getErrorCode(readdedProjection.body)).not.toBe("WORKSPACE_ACTION_FORBIDDEN");

        const oldTokenAfterReadd = await request(`/api/v1/workspaces/${workspaceId}`, { accessToken: userB.accessToken });
        expect(oldTokenAfterReadd.status).toBe(403);
        expect(getErrorCode(oldTokenAfterReadd.body)).toBe("WORKSPACE_ACTION_FORBIDDEN");

        await wait(1_100);
        const freshUserB = await login(userB.email);
        let freshAccess: ApiResult | undefined;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          freshAccess = await request(`/api/v1/workspaces/${workspaceId}`, { accessToken: freshUserB.accessToken });
          if (freshAccess.status === 200) break;
          await wait(100);
        }
        expect(freshAccess?.status).toBe(200);
      },
      60_000,
    );

    it(
      "creates a TODO with normalized fields",
      async () => {
        const result =
          await createTodo(
            userA,
            {
              title:
                "  Normalized title  ",

              description:
                "  Normalized description  ",

              dueDate:
                "2026-12-01T10:00:00.000Z",
            },
          );

        expect(result.status).toBe(
          201,
        );

        userASecondTodo =
          parseTodo(
            result.body,
          );

        expect(
          userASecondTodo.title,
        ).toBe(
          "Normalized title",
        );

        expect(
          userASecondTodo.description,
        ).toBe(
          "Normalized description",
        );

        expect(
          userASecondTodo.state,
        ).toBe(
          "pending",
        );
      },
    );

    it(
      "rejects TODO creation without an idempotency key",
      async () => {
        const result =
          await request(
            "/api/v1/todos",
            {
              method:
                "POST",

              accessToken:
                userA.accessToken,

              body: {
                title:
                  `Missing key ${crypto.randomUUID()}`,
              },
            },
          );

        expect(result.status).toBe(
          400,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "INVALID_IDEMPOTENCY_KEY",
        );
      },
    );

    it(
      "returns history for an owned TODO",
      async () => {
        let result:
          ApiResult | undefined;

        for (let attempt = 0; attempt < 60; attempt += 1) {
          result =
            await request(
              `/api/v1/todos/${userASecondTodo.id}/history`,
              {
                accessToken:
                  userA.accessToken,
              },
            );

          if (
            result.status ===
              200 &&
            isRecord(result.body) &&
            Array.isArray(result.body.items) &&
            result.body.items.length > 0
          ) {
            break;
          }

          await wait(250);
        }

        expect(result?.status).toBe(
          200,
        );

        expect(
          isRecord(result?.body) &&
          Array.isArray(result.body.items) &&
          result.body.items.length,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "returns the original TODO when the same create request is retried",
      async () => {
        const idempotencyKey =
          crypto.randomUUID();

        const body = {
          title:
            `Idempotent ${crypto.randomUUID()}`,

          description:
            "Created once",
        };

        const firstResult =
          await createTodo(
            userA,
            body,
            idempotencyKey,
          );

        const secondResult =
          await createTodo(
            userA,
            body,
            idempotencyKey,
          );

        expect(firstResult.status).toBe(
          201,
        );

        expect(secondResult.status).toBe(
          201,
        );

        const firstTodo =
          parseTodo(
            firstResult.body,
          );

        const secondTodo =
          parseTodo(
            secondResult.body,
          );

        expect(secondTodo).toEqual(
          firstTodo,
        );
      },
    );

    it(
      "allows only one TODO for concurrent requests using the same idempotency key",
      async () => {
        const idempotencyKey =
          crypto.randomUUID();

        const body = {
          title:
            `Concurrent idempotent ${crypto.randomUUID()}`,
        };

        const results =
          await Promise.all([
            createTodo(
              userA,
              body,
              idempotencyKey,
            ),

            createTodo(
              userA,
              body,
              idempotencyKey,
            ),
          ]);

        expect(
          results.map(
            (result) =>
              result.status,
          ),
        ).toEqual([
          201,
          201,
        ]);

        const firstResult =
          results[0];

        const secondResult =
          results[1];

        expect(firstResult).toBeDefined();
        expect(secondResult).toBeDefined();



        expect(
          parseTodo(
            secondResult.body,
          ).id,
        ).toBe(
          parseTodo(
            firstResult.body,
          ).id,
        );
      },
    );

    it(
      "rejects an idempotency key reused with a different request",
      async () => {
        const idempotencyKey =
          crypto.randomUUID();

        const firstResult =
          await createTodo(
            userA,
            {
              title:
                `First idempotent ${crypto.randomUUID()}`,
            },
            idempotencyKey,
          );

        expect(firstResult.status).toBe(
          201,
        );

        const secondResult =
          await createTodo(
            userA,
            {
              title:
                `Different idempotent ${crypto.randomUUID()}`,
            },
            idempotencyKey,
          );

        expect(secondResult.status).toBe(
          409,
        );

        expect(
          getErrorCode(
            secondResult.body,
          ),
        ).toBe(
          "IDEMPOTENCY_KEY_REUSED",
        );
      },
    );

    it(
      "rejects a duplicate active title for the same owner",
      async () => {
        const result =
          await createTodo(
            userA,
            {
              title:
                " normalized TITLE ",
            },
          );

        expect(result.status).toBe(
          409,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "TODO_TITLE_ALREADY_EXISTS",
        );
      },
    );

    it(
      "allows the same title for another owner",
      async () => {
        const result =
          await createTodo(
            userB,
            {
              title:
                "Normalized title",
            },
          );

        expect(result.status).toBe(
          201,
        );
      },
    );

    it(
      "allows only one concurrent duplicate-title creation",
      async () => {
        const title =
          `Concurrent ${crypto.randomUUID()}`;

        const results =
          await Promise.all([
            createTodo(
              userA,
              {
                title,
              },
            ),

            createTodo(
              userA,
              {
                title:
                  `  ${title.toUpperCase()}  `,
              },
            ),
          ]);

        const statuses =
          results
            .map(
              (result) =>
                result.status,
            )
            .sort(
              (
                first,
                second,
              ) =>
                first - second,
            );

        expect(statuses).toEqual([
          201,
          409,
        ]);
      },
    );

    it(
      "lists only the authenticated owner's TODOs",
      async () => {
        const result =
          await request(
            "/api/v1/todos",
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(result.status).toBe(
          200,
        );

        const items =
          getListItems(
            result.body,
          );

        expect(
          items.every(
            (todo) =>
              todo.ownerId ===
              userAFirstTodo.ownerId,
          ),
        ).toBe(true);

        expect(
          items.some(
            (todo) =>
              todo.id ===
              userBTodo.id,
          ),
        ).toBe(false);
      },
    );

    it(
      "returns pagination metadata",
      async () => {
        const result =
          await request(
            "/api/v1/todos?page=1&pageSize=1",
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(result.status).toBe(
          200,
        );

        expect(
          getListItems(
            result.body,
          ),
        ).toHaveLength(1);

        const pagination =
          getPagination(
            result.body,
          );

        expect(
          pagination.page,
        ).toBe(1);

        expect(
          pagination.pageSize,
        ).toBe(1);

        expect(
          typeof pagination.totalItems,
        ).toBe("number");

        expect(
          typeof pagination.totalPages,
        ).toBe("number");
      },
    );

    it(
      "filters TODOs by state",
      async () => {
        const updateResult =
          await request(
            `/api/v1/todos/${userASecondTodo.id}`,
            {
              method:
                "PATCH",

              accessToken:
                userA.accessToken,

              body: {
                state:
                  "completed",
              },
            },
          );

        expect(
          updateResult.status,
        ).toBe(200);

        const listResult =
          await request(
            "/api/v1/todos?state=completed",
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(
          listResult.status,
        ).toBe(200);

        const items =
          getListItems(
            listResult.body,
          );

        expect(
          items.length,
        ).toBeGreaterThan(0);

        expect(
          items.every(
            (todo) =>
              todo.state ===
              "completed",
          ),
        ).toBe(true);
      },
    );

    it(
      "supports creation-date sorting",
      async () => {
        const result =
          await request(
            "/api/v1/todos?sortBy=createdAt&sortOrder=asc",
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(result.status).toBe(
          200,
        );

        const items =
          getListItems(
            result.body,
          );

        for (
          let index = 1;
          index < items.length;
          index += 1
        ) {
          const previous =
            items[index - 1];

          const current =
            items[index];

          if (
            previous !== undefined &&
            current !== undefined
          ) {
            expect(
              new Date(
                previous.createdAt,
              ).getTime(),
            ).toBeLessThanOrEqual(
              new Date(
                current.createdAt,
              ).getTime(),
            );
          }
        }
      },
    );

    it(
      "retrieves an owned TODO",
      async () => {
        const result =
          await request(
            `/api/v1/todos/${userAFirstTodo.id}`,
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(result.status).toBe(
          200,
        );

        expect(
          parseTodo(
            result.body,
          ).id,
        ).toBe(
          userAFirstTodo.id,
        );
      },
    );

    it(
      "returns identical responses for missing and cross-owner GET",
      async () => {
        const missing =
          await request(
            "/api/v1/todos/11111111-1111-4111-8111-111111111111",
            {
              accessToken:
                userB.accessToken,
            },
          );

        const crossOwner =
          await request(
            `/api/v1/todos/${userAFirstTodo.id}`,
            {
              accessToken:
                userB.accessToken,
            },
          );

        expect(missing.status).toBe(
          404,
        );

        expect(
          crossOwner.status,
        ).toBe(404);

        expect(
          getErrorCode(
            missing.body,
          ),
        ).toBe(
          "TODO_NOT_FOUND",
        );

        expect(
          getErrorCode(
            crossOwner.body,
          ),
        ).toBe(
          "TODO_NOT_FOUND",
        );

        expect(
          getErrorMessage(
            crossOwner.body,
          ),
        ).toBe(
          getErrorMessage(
            missing.body,
          ),
        );

        const measureRequest = async (
          path: string,
        ): Promise<number> => {
          const startedAt = performance.now();
          await request(
            path,
            {
              accessToken: userB.accessToken,
            },
          );
          return performance.now() - startedAt;
        };

        const missingDurations: number[] = [];
        const crossOwnerDurations: number[] = [];
        for (let sample = 0; sample < 4; sample += 1) {
          missingDurations.push(
            await measureRequest(
              "/api/v1/todos/11111111-1111-4111-8111-111111111111",
            ),
          );
          crossOwnerDurations.push(
            await measureRequest(
              `/api/v1/todos/${userAFirstTodo.id}`,
            ),
          );
        }

        const median = (durations: readonly number[]): number => {
          const ordered = [...durations].sort((left, right) => left - right);
          return ordered[Math.floor(ordered.length / 2)] ?? 0;
        };

        expect(
          Math.abs(median(missingDurations) - median(crossOwnerDurations)),
        ).toBeLessThan(100);
      },
    );

    it(
      "returns fresh data after an update",
      async () => {
        /*
         * Warm the item cache.
         */
        await request(
          `/api/v1/todos/${userAFirstTodo.id}`,
          {
            accessToken:
              userA.accessToken,
          },
        );

        await request(
          `/api/v1/todos/${userAFirstTodo.id}`,
          {
            accessToken:
              userA.accessToken,
          },
        );

        const updatedTitle =
          `Updated ${crypto.randomUUID()}`;

        const update =
          await request(
            `/api/v1/todos/${userAFirstTodo.id}`,
            {
              method:
                "PATCH",

              accessToken:
                userA.accessToken,

              body: {
                title:
                  updatedTitle,
              },
            },
          );

        expect(update.status).toBe(
          200,
        );

        const afterUpdate =
          await request(
            `/api/v1/todos/${userAFirstTodo.id}`,
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(
          parseTodo(
            afterUpdate.body,
          ).title,
        ).toBe(
          updatedTitle,
        );
      },
    );

    it(
      "prevents cross-owner update",
      async () => {
        const result =
          await request(
            `/api/v1/todos/${userAFirstTodo.id}`,
            {
              method:
                "PATCH",

              accessToken:
                userB.accessToken,

              body: {
                state:
                  "cancelled",
              },
            },
          );

        expect(result.status).toBe(
          404,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "TODO_NOT_FOUND",
        );
      },
    );

    it(
      "prevents cross-owner deletion",
      async () => {
        const result =
          await request(
            `/api/v1/todos/${userAFirstTodo.id}`,
            {
              method:
                "DELETE",

              accessToken:
                userB.accessToken,
            },
          );

        expect(result.status).toBe(
          404,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "TODO_NOT_FOUND",
        );
      },
    );

    it(
      "deletes an owned TODO and invalidates cached reads",
      async () => {
        /*
         * Warm the list cache before deletion.
         */
        await request(
          "/api/v1/todos",
          {
            accessToken:
              userA.accessToken,
          },
        );

        await request(
          "/api/v1/todos",
          {
            accessToken:
              userA.accessToken,
          },
        );

        const deletion =
          await request(
            `/api/v1/todos/${userASecondTodo.id}`,
            {
              method:
                "DELETE",

              accessToken:
                userA.accessToken,
            },
          );

        expect(
          deletion.status,
        ).toBe(204);

        expect(
          deletion.body,
        ).toBeUndefined();

        const getDeleted =
          await request(
            `/api/v1/todos/${userASecondTodo.id}`,
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(
          getDeleted.status,
        ).toBe(404);

        const listAfterDelete =
          await request(
            "/api/v1/todos",
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(
          getListItems(
            listAfterDelete.body,
          ).some(
            (todo) =>
              todo.id ===
              userASecondTodo.id,
          ),
        ).toBe(false);
      },
    );

    it(
      "returns 404 when deleting the same TODO again",
      async () => {
        const result =
          await request(
            `/api/v1/todos/${userASecondTodo.id}`,
            {
              method:
                "DELETE",

              accessToken:
                userA.accessToken,
            },
          );

        expect(result.status).toBe(
          404,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "TODO_NOT_FOUND",
        );
      },
    );

    it(
      "rejects invalid query parameters",
      async () => {
        const result =
          await request(
            "/api/v1/todos?page=0&sortBy=title",
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(result.status).toBe(
          400,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "VALIDATION_ERROR",
        );
      },
    );

    it(
      "rejects an invalid TODO UUID",
      async () => {
        const result =
          await request(
            "/api/v1/todos/not-a-uuid",
            {
              accessToken:
                userA.accessToken,
            },
          );

        expect(result.status).toBe(
          400,
        );

        expect(
          getErrorCode(
            result.body,
          ),
        ).toBe(
          "VALIDATION_ERROR",
        );
      },
    );
  },
)
