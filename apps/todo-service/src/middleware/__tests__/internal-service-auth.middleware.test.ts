import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  encodeIdentity,
  runWithRequestContext,
  signIdentity,
} from "@todo/common";
import type { InternalIdentityEnvelope } from "@todo/contracts";
import { env } from "../../config/env.js";
import { requireInternalIdentity } from "../internal-service-auth.middleware.js";

describe("requireInternalIdentity", () => {
  it("exposes the original access-token iat only after signature validation", () => {
    const now = Math.floor(Date.now() / 1000);
    const accessTokenIssuedAt = now - 40;
    const identity: InternalIdentityEnvelope = {
      issuer: "gateway",
      audience: "todo-service",
      requestId: "request-1",
      issuedAt: now,
      expiresAt: now + 30,
      userId: "user-1",
      sessionId: "session-1",
      email: "user@example.com",
      accessTokenIssuedAt,
    };
    const encodedIdentity = encodeIdentity(identity);
    const signature = signIdentity(encodedIdentity, env.INTERNAL_SERVICE_SECRET);
    const request = {
      header: (name: string): string | undefined => {
        if (name === "x-internal-identity") return encodedIdentity;
        if (name === "x-internal-signature") return signature;
        return undefined;
      },
    } as Request;
    const response = { locals: {} } as Response;
    const next = vi.fn() as NextFunction;

    runWithRequestContext(
      { requestId: "request-1", serviceName: "todo-service" },
    () => {
  requireInternalIdentity(request, response, next);
},
    );

    expect(next).toHaveBeenCalledWith();
    expect(response.locals.accessTokenIssuedAt).toBe(accessTokenIssuedAt);
  });
});