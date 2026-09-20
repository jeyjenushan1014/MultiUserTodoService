import {
  randomUUID,
} from "node:crypto";

import request from "supertest";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  z,
} from "zod";

import {
  REQUEST_ID_HEADER,
} from "@todo/common";

import {
  app,
} from "../app.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const healthResponseSchema =
  z.object({
    status: z.enum([
      "healthy",
      "degraded",
      "unhealthy",
    ]),
    service: z.string(),
  });

const errorResponseSchema =
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z
        .array(
          z.object({
            field: z
              .string()
              .optional(),
            message: z.string(),
          }),
        )
        .optional(),
    }),
  });

function parseHealthResponse(
  responseBody: unknown,
): z.infer<
  typeof healthResponseSchema
> {
  return healthResponseSchema.parse(
    responseBody,
  );
}

function parseErrorResponse(
  responseBody: unknown,
): z.infer<
  typeof errorResponseSchema
> {
  return errorResponseSchema.parse(
    responseBody,
  );
}

describe("Gateway application", () => {
  it("returns Gateway health", async () => {
    const response =
      await request(app)
        .get("/health")
        .expect(200);

    const responseBody =
      parseHealthResponse(
        response.body as unknown,
      );

    expect(
      responseBody,
    ).toEqual({
      status: "healthy",
      service: "gateway",
    });

    expect(
      response.headers[
        REQUEST_ID_HEADER
      ],
    ).toMatch(UUID_PATTERN);
  });

  it("preserves a valid request ID", async () => {
    const requestId =
      randomUUID();

    const response =
      await request(app)
        .get("/health")
        .set(
          REQUEST_ID_HEADER,
          requestId,
        )
        .expect(200);

    expect(
      response.headers[
        REQUEST_ID_HEADER
      ],
    ).toBe(requestId);
  });

  it("replaces an invalid request ID", async () => {
    const invalidRequestId =
      "invalid-request-id";

    const response =
      await request(app)
        .get("/health")
        .set(
          REQUEST_ID_HEADER,
          invalidRequestId,
        )
        .expect(200);

    const generatedRequestId =
      response.headers[
        REQUEST_ID_HEADER
      ];

    expect(
      generatedRequestId,
    ).not.toBe(
      invalidRequestId,
    );

    expect(
      generatedRequestId,
    ).toMatch(UUID_PATTERN);
  });

  it("returns the standard error for an unknown route", async () => {
    const response =
      await request(app)
        .get("/unknown")
        .expect(404);

    const responseBody =
      parseErrorResponse(
        response.body as unknown,
      );

    expect(
      responseBody.error.code,
    ).toBe(
      "ROUTE_NOT_FOUND",
    );

    expect(
      responseBody.error.message,
    ).toBe(
      "Route GET /unknown was not found",
    );

    expect(
      responseBody.error.requestId,
    ).toBe(
      response.headers[
        REQUEST_ID_HEADER
      ],
    );
  });

  it("rejects malformed JSON", async () => {
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
      parseErrorResponse(
        response.body as unknown,
      );

    expect(
      responseBody.error,
    ).toEqual({
      code: "INVALID_JSON",
      message:
        "Request body contains invalid JSON",
      requestId:
        response.headers[
          REQUEST_ID_HEADER
        ],
    });
  });

  it("rejects an oversized JSON body", async () => {
    const largePayload = {
      value: "a".repeat(
        110 * 1024,
      ),
    };

    const response =
      await request(app)
        .post("/unknown")
        .send(largePayload)
        .expect(413);

    const responseBody =
      parseErrorResponse(
        response.body as unknown,
      );

    expect(
      responseBody.error.code,
    ).toBe(
      "PAYLOAD_TOO_LARGE",
    );

    expect(
      responseBody.error.message,
    ).toBe(
      "Request body is too large",
    );

    expect(
      responseBody.error.requestId,
    ).toBe(
      response.headers[
        REQUEST_ID_HEADER
      ],
    );
  });

  it("does not expose the Express header", async () => {
    const response =
      await request(app)
        .get("/health")
        .expect(200);

    expect(
      response.headers[
        "x-powered-by"
      ],
    ).toBeUndefined();
  });

  it("adds security headers", async () => {
    const response =
      await request(app)
        .get("/health")
        .expect(200);

    expect(
      response.headers[
        "x-content-type-options"
      ],
    ).toBe("nosniff");
  });
});