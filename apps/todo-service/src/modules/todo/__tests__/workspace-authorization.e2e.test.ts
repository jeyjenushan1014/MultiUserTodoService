

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

vi.mock("../../../security/workspace-membership.cache.js", () => ({
  getWorkspaceAuthorization: vi.fn(),
}));

import { authorizeWorkspace } from "../../../middleware/authorize-workspace.middleware.js";
import * as membershipCache from "../../../security/workspace-membership.cache.js";

interface AuthorizationError extends Error {
  statusCode?: number;
  code?: string;
}

function makeReq(
  params: Record<string, string> = {},
  locals: Record<string, unknown> = {},
): Request {
  return { params, locals } as unknown as Request;
}

function makeRes(locals: Record<string, unknown> = {}): Response {
  return { locals } as unknown as Response;
}

function makeNext(): NextFunction {
  return vi.fn();
}

describe("authorizeWorkspace e2e-style tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("allows when membership role permits the action", async () => {
    const getAuthorizationMock = vi.mocked(
      membershipCache.getWorkspaceAuthorization,
    );

    getAuthorizationMock.mockResolvedValueOnce({ role: "editor", revokedBefore: null });

    const req = makeReq(
      { workspaceId: "w-1" },
      {},
    );

    const res = makeRes({
      callerIdentity: {
        userId: "user-1",
      },
      accessTokenIssuedAt: Math.floor(Date.now() / 1000),
    });

    const next = makeNext();

    const mw: RequestHandler = authorizeWorkspace(
      "task.update",
      "workspaceId",
    );

    await mw(req, res, next);

    expect(getAuthorizationMock).toHaveBeenCalledWith(
      "user-1",
      "w-1",
    );

    expect(next).toHaveBeenCalledTimes(1);

    expect(next).toHaveBeenCalledWith();
  });

  it("denies when no membership exists", async () => {
    const getAuthorizationMock = vi.mocked(
      membershipCache.getWorkspaceAuthorization,
    );

    getAuthorizationMock.mockResolvedValueOnce({ role: null, revokedBefore: null });

    const req = makeReq({
      workspaceId: "w-1",
    });

    const res = makeRes({
      callerIdentity: {
        userId: "user-2",
      },
      accessTokenIssuedAt: Math.floor(Date.now() / 1000),
    });

    const next = vi.fn();

    const mw: RequestHandler = authorizeWorkspace(
      "task.update",
      "workspaceId",
    );

    await mw(req, res, next);

    expect(getAuthorizationMock).toHaveBeenCalledWith(
      "user-2",
      "w-1",
    );

    expect(next).toHaveBeenCalledTimes(1);

    const err = next.mock.calls[0]?.[0] as
      | AuthorizationError
      | undefined;

    expect(err).toBeInstanceOf(Error);

    expect(
      err?.statusCode === 403 ||
        err?.code === "WORKSPACE_ACTION_FORBIDDEN",
    ).toBe(true);
  });

  it("denies when token was issued before membership revocation", async () => {
    const getAuthorizationMock = vi.mocked(
      membershipCache.getWorkspaceAuthorization,
    );

    const revokedAt = Math.floor(Date.now() / 1000) + 10;
    getAuthorizationMock.mockResolvedValueOnce({ role: "editor", revokedBefore: revokedAt });

    const issuedAt = Math.floor(Date.now() / 1000);

    const req = makeReq({
      workspaceId: "w-1",
    });

    const res = makeRes({
      callerIdentity: {
        userId: "user-3",
      },
      accessTokenIssuedAt: issuedAt,
    });

    const next = vi.fn();

    const mw: RequestHandler = authorizeWorkspace(
      "task.update",
      "workspaceId",
    );

    await mw(req, res, next);

    expect(getAuthorizationMock).toHaveBeenCalledWith(
      "user-3",
      "w-1",
    );

    expect(next).toHaveBeenCalledTimes(1);

    const err = next.mock.calls[0]?.[0] as
      | AuthorizationError
      | undefined;

    expect(err).toBeInstanceOf(Error);

    expect(
      err?.statusCode === 403 ||
        err?.code === "WORKSPACE_ACTION_FORBIDDEN",
    ).toBe(true);
  });
});