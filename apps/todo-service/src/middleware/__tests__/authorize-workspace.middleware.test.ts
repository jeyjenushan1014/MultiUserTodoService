import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NextFunction, Request, Response } from "express";

import { AppError } from "@todo/common";

vi.mock("../../security/workspace-membership.cache.js", () => ({
  getWorkspaceAuthorization: vi.fn(),
}));

import { getWorkspaceAuthorization } from "../../security/workspace-membership.cache.js";
import { authorizeWorkspace } from "../authorize-workspace.middleware.js";

function makeResponse(): Response {
  return {
    locals: {},
  } as unknown as Response;
}

function makeRequest(params: Record<string, string> = {}): Request {
  return { params } as unknown as Request;
}

interface NextMockResult {
  next: NextFunction;
  nextMock: ReturnType<typeof vi.fn>;
}

function makeNext(): NextMockResult {
  const nextMock = vi.fn();
  const next: NextFunction = nextMock;

  return { next, nextMock };
}

describe("authorizeWorkspace middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows an action permitted by the projected role", async () => {
    vi.mocked(getWorkspaceAuthorization).mockResolvedValueOnce({
      role: "editor",
      revokedBefore: null,
    });

    const { next, nextMock } = makeNext();
    const handler = authorizeWorkspace("task.update");

    const req = makeRequest({ workspaceId: "w" });
    const res = makeResponse();

    Object.assign(res.locals, {
      callerIdentity: {
        userId: "u",
        sessionId: "s",
        email: "e",
      },
      accessTokenIssuedAt: Math.floor(Date.now() / 1000),
    });

    await handler(req, res, next);

    expect(nextMock).toHaveBeenCalledWith();
  });

  it("denies when the projection has no membership", async () => {
    vi.mocked(getWorkspaceAuthorization).mockResolvedValueOnce({
      role: null,
      revokedBefore: null,
    });

    const { next, nextMock } = makeNext();
    const handler = authorizeWorkspace("workspace.read");

    const req = makeRequest({ workspaceId: "w" });
    const res = makeResponse();

    Object.assign(res.locals, {
      callerIdentity: {
        userId: "u",
        sessionId: "s",
        email: "e",
      },
      accessTokenIssuedAt: Math.floor(Date.now() / 1000),
    });

    await handler(req, res, next);

    expect(nextMock.mock.calls[0]?.[0]).toMatchObject({
      code: "WORKSPACE_ACTION_FORBIDDEN",
    });
  });

  it("denies a token issued at or before revoked-before", async () => {
    const revokedBefore = Math.floor(Date.now() / 1000);

    vi.mocked(getWorkspaceAuthorization).mockResolvedValueOnce({
      role: "administrator",
      revokedBefore,
    });

    const { next, nextMock } = makeNext();
    const handler = authorizeWorkspace("workspace.read");

    const req = makeRequest({ workspaceId: "w" });
    const res = makeResponse();

    Object.assign(res.locals, {
      callerIdentity: {
        userId: "u",
        sessionId: "s",
        email: "e",
      },
      accessTokenIssuedAt: revokedBefore,
    });

    await handler(req, res, next);

    expect(nextMock.mock.calls[0]?.[0]).toMatchObject({
      code: "WORKSPACE_ACTION_FORBIDDEN",
    });
  });

  it("allows a token issued after revoked-before when the membership is active", async () => {
    vi.mocked(getWorkspaceAuthorization).mockResolvedValueOnce({
      role: "viewer",
      revokedBefore: Math.floor(Date.now() / 1000) - 1,
    });

    const { next, nextMock } = makeNext();
    const handler = authorizeWorkspace("workspace.read");

    const req = makeRequest({ workspaceId: "w" });
    const res = makeResponse();

    Object.assign(res.locals, {
      callerIdentity: {
        userId: "u",
        sessionId: "s",
        email: "e",
      },
      accessTokenIssuedAt: Math.floor(Date.now() / 1000),
    });

    await handler(req, res, next);

    expect(nextMock).toHaveBeenCalledWith();
  });

  it("fails closed when the authorization projection is unavailable", async () => {
    vi.mocked(getWorkspaceAuthorization).mockRejectedValueOnce(
      new AppError(
        503,
        "WORKSPACE_PROJECTION_UNAVAILABLE",
        "Unavailable",
      ),
    );

    const { next, nextMock } = makeNext();
    const handler = authorizeWorkspace("workspace.read");

    const req = makeRequest({ workspaceId: "w" });
    const res = makeResponse();

    Object.assign(res.locals, {
      callerIdentity: {
        userId: "u",
        sessionId: "s",
        email: "e",
      },
      accessTokenIssuedAt: Math.floor(Date.now() / 1000),
    });

    await handler(req, res, next);

    expect(nextMock.mock.calls[0]?.[0]).toMatchObject({
      code: "WORKSPACE_PROJECTION_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("rejects missing token iat before making a projection decision", async () => {
    const { next, nextMock } = makeNext();
    const handler = authorizeWorkspace("workspace.read");

    const req = makeRequest({ workspaceId: "w" });
    const res = makeResponse();

    Object.assign(res.locals, {
      callerIdentity: {
        userId: "u",
        sessionId: "s",
        email: "e",
      },
    });

    await handler(req, res, next);

    expect(getWorkspaceAuthorization).not.toHaveBeenCalled();

    expect(nextMock.mock.calls[0]?.[0]).toMatchObject({
      code: "AUTHENTICATION_CONTEXT_INVALID",
    });
  });
});