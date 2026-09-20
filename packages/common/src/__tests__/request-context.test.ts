import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getRequestContext,
  getRequestId,
  runWithRequestContext,
} from "../request-context/request-context.js";

describe("request context", () => {
  it("provides request information inside the context", () => {
    const result =
      runWithRequestContext(
        {
          requestId: "request-123",
          serviceName: "gateway",
        },
        () => {
          return {
            context: getRequestContext(),
            requestId: getRequestId(),
          };
        },
      );

    expect(result).toEqual({
      context: {
        requestId: "request-123",
        serviceName: "gateway",
      },
      requestId: "request-123",
    });
  });

  it("returns undefined outside a request context", () => {
    expect(
      getRequestContext(),
    ).toBeUndefined();

    expect(
      getRequestId(),
    ).toBeUndefined();
  });

  it("keeps concurrent request contexts separate", async () => {
    const first =
      runWithRequestContext(
        {
          requestId: "first-request",
          serviceName: "gateway",
        },
        async () => {
          await Promise.resolve();
          return getRequestId();
        },
      );

    const second =
      runWithRequestContext(
        {
          requestId: "second-request",
          serviceName: "account-service",
        },
        async () => {
          await Promise.resolve();
          return getRequestId();
        },
      );

    await expect(first).resolves.toBe(
      "first-request",
    );

    await expect(second).resolves.toBe(
      "second-request",
    );
  });
});