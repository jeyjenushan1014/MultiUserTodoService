import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Request, Response, NextFunction } from "express";

// The controller imports workspaceService from workspace.module.js; we'll mock it.
vi.mock("../../workspace/workspace.module.js", () => {
  return {
    workspaceService: {
      listWorkspacesForAccount: vi.fn(),
    },
  };
});

import { getAccountWorkspacesController } from "../account-lookup.workspaces.controller.js";
import { workspaceService } from "../../workspace/workspace.module.js";

function createMockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    status,
    json,
    locals: {},
  } as unknown as Response;
}

function createMockNext(): NextFunction {
  return vi.fn();
}

describe("getAccountWorkspacesController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 and workspaces for a valid userId", async () => {
    const req = { params: { userId: "user-1" } } as unknown as Request;
    const res = createMockRes();
    const next = createMockNext();

    (workspaceService.listWorkspacesForAccount as unknown as vi.Mock).mockResolvedValueOnce([
      { id: "w-1", name: "Workspace 1", createdBy: "u1", createdAt: new Date().toISOString() },
    ]);

    await getAccountWorkspacesController(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.status as unknown as vi.Mock).mock.results[0].value.json).toHaveBeenCalledWith({
      workspaces: [
        { id: "w-1", name: "Workspace 1", createdBy: "u1", createdAt: expect.any(String) },
      ],
    });
    expect(workspaceService.listWorkspacesForAccount).toHaveBeenCalledWith("user-1");
  });

  it("calls next with AppError when userId is missing", async () => {
    const req = { params: { userId: "" } } as unknown as Request;
    const res = createMockRes();
    const next = createMockNext();

    await getAccountWorkspacesController(req, res, next);

    expect(next).toHaveBeenCalled();
    const calledWith = (next as unknown as vi.Mock).mock.calls[0][0];
    expect(calledWith).toBeInstanceOf(Error);
  });
});
