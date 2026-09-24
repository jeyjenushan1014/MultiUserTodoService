import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import request from "supertest";

import {
  z,
} from "zod";

import {
  REQUEST_ID_HEADER,
} from "@todo/common";

import {
  checkDatabaseHealth,
} from "../config/database.js";

vi.mock(
  "../config/database.js",
  (): {
    checkDatabaseHealth:
      ReturnType<typeof vi.fn>;
  } => ({
    checkDatabaseHealth:
      vi.fn(),
  }),
);

import {
  app,
} from "../app.js";

const mockedCheckDatabaseHealth =
  vi.mocked(
    checkDatabaseHealth,
  );

const healthResponseSchema =
  z.object({
    status: z.enum([
      "healthy",
      "degraded",
      "unhealthy",
    ]),
    service: z.string(),
    dependencies: z.record(
      z.string(),
      z.enum([
        "available",
        "unavailable",
      ]),
    ),
  });

const errorResponseSchema =
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
    }),
  });

describe("Account Service application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 when PostgreSQL is available", async () => {
    mockedCheckDatabaseHealth
      .mockResolvedValue(true);

    const response =
      await request(app)
        .get("/health")
        .expect(200);

    const responseBody =
      healthResponseSchema.parse(
        response.body as unknown,
      );

    expect(
      responseBody,
    ).toEqual({
      status: "healthy",
      service:
        "account-service",
      dependencies: {
        database:
          "available",
      },
    });

    expect(
      response.headers[
        REQUEST_ID_HEADER
      ],
    ).toBeDefined();
  });

  it("returns 503 when PostgreSQL is unavailable", async () => {
    mockedCheckDatabaseHealth
      .mockResolvedValue(false);

    const response =
      await request(app)
        .get("/health")
        .expect(503);

    const responseBody =
      healthResponseSchema.parse(
        response.body as unknown,
      );

    expect(
      responseBody,
    ).toEqual({
      status: "unhealthy",
      service:
        "account-service",
      dependencies: {
        database:
          "unavailable",
      },
    });
  });

  it("returns the standard error for an unknown route", async () => {
    const response =
      await request(app)
        .get("/unknown")
        .expect(404);

    const responseBody =
      errorResponseSchema.parse(
        response.body as unknown,
      );

    expect(
      responseBody.error.code,
    ).toBe(
      "ROUTE_NOT_FOUND",
    );

    expect(
      responseBody.error.requestId,
    ).toBe(
      response.headers[
        REQUEST_ID_HEADER
      ],
    );
  });

  it("rejects malformed JSON without terminating the process", async () => {
    const response =
      await request(app)
        .post("/unknown")
        .set(
          "Content-Type",
          "application/json",
        )
        .send('{"invalid":')
        .expect(400);

    const responseBody =
      errorResponseSchema.parse(
        response.body as unknown,
      );

    expect(
      responseBody.error.code,
    ).toBe(
      "INVALID_JSON",
    );
  });
});