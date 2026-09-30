import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeIdentity, verifyIdentitySignature } from "@todo/common";
import { env } from "../../config/env.js";
import { createTodo } from "../todo-service.client.js";

describe("Todo Service client identity envelope", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs the original access-token iat into the downstream identity", async () => {
    const accessTokenIssuedAt = Math.floor(Date.now() / 1000) - 30;

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await createTodo(
      { title: "propagation test" },
      {
        userId: "user-1",
        sessionId: "session-1",
        email: "user@example.com",
        accessTokenIssuedAt,
      },
      "request-1",
      "idempotency-1",
    );

    const requestInit = fetchMock.mock.calls[0]?.[1];

    expect(requestInit).toBeDefined();

    const headers = requestInit?.headers as Record<string, string>;

    const encodedIdentity = headers["x-internal-identity"];
    const signature = headers["x-internal-signature"];

    expect(encodedIdentity).toBeDefined();
    expect(signature).toBeDefined();

    if (encodedIdentity === undefined || signature === undefined) {
      throw new Error("Expected internal identity headers to be defined");
    }

    expect(
      verifyIdentitySignature(
        encodedIdentity,
        signature,
        env.INTERNAL_SERVICE_SECRET,
      ),
    ).toBe(true);

    expect(decodeIdentity(encodedIdentity).accessTokenIssuedAt).toBe(
      accessTokenIssuedAt,
    );
  });
});