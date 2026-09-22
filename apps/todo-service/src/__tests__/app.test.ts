import {
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";

import {
  app,
} from "../app.js";

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

function isErrorBody(
  value: unknown,
): value is ErrorBody {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const root =
    value as Record<
      string,
      unknown
    >;

  const error =
    root.error;

  if (
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  const errorRecord =
    error as Record<
      string,
      unknown
    >;

  return (
    typeof errorRecord.code ===
      "string" &&
    typeof errorRecord.message ===
      "string" &&
    typeof errorRecord.requestId ===
      "string"
  );
}

describe(
  "TODO Service application",
  () => {
    it(
      "returns liveness",
      async () => {
        const response =
          await request(app)
            .get(
              "/health/live",
            )
            .expect(200);

        expect(
          response.body,
        ).toEqual({
          status:
            "healthy",

          service:
            "todo-service",
        });

        expect(
          response.headers[
            "x-request-id"
          ],
        ).toBeDefined();
      },
    );

    it(
      "preserves a valid request ID",
      async () => {
        const requestId =
          "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0";

        const response =
          await request(app)
            .get(
              "/health/live",
            )
            .set(
              "x-request-id",
              requestId,
            )
            .expect(200);

        expect(
          response.headers[
            "x-request-id"
          ],
        ).toBe(requestId);
      },
    );

    it(
      "generates a new ID when the supplied request ID is invalid",
      async () => {
        const response =
          await request(app)
            .get(
              "/health/live",
            )
            .set(
              "x-request-id",
              "invalid-request-id",
            )
            .expect(200);

        expect(
          response.headers[
            "x-request-id"
          ],
        ).not.toBe(
          "invalid-request-id",
        );
      },
    );

    it(
      "returns the standard error shape for an unknown route",
      async () => {
        const response =
          await request(app)
            .get(
              "/unknown",
            )
            .expect(404);

        expect(
          isErrorBody(
            response.body,
          ),
        ).toBe(true);

        if (
          !isErrorBody(
            response.body,
          )
        ) {
          throw new Error(
            "Expected ErrorBody",
          );
        }

        expect(
          response.body.error.code,
        ).toBe(
          "ROUTE_NOT_FOUND",
        );
      },
    );

    it(
      "rejects malformed JSON",
      async () => {
        const response =
          await request(app)
            .post(
              "/unknown",
            )
            .set(
              "content-type",
              "application/json",
            )
            .send(
              '{"title":',
            )
            .expect(400);

        expect(
          isErrorBody(
            response.body,
          ),
        ).toBe(true);

        if (
          !isErrorBody(
            response.body,
          )
        ) {
          throw new Error(
            "Expected ErrorBody",
          );
        }

        expect(
          response.body.error.code,
        ).toBe(
          "INVALID_JSON",
        );
      },
    );
  },
);