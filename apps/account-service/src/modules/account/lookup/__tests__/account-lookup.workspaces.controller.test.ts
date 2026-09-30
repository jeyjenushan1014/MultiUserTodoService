/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type { NextFunction, Request, Response } from "express";

vi.mock("../../../workspace/workspace.module.js", () => ({
  workspaceService: {
    listWorkspacesForAccount: vi.fn(),
  },
}));

import { workspaceService } from "../../../workspace/workspace.module.js";
import { getAccountWorkspacesController } from "../account-lookup.workspaces.controller.js";

interface WorkspaceRecord {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

interface MockResponse extends Response {
  status: Mock;
  json: Mock;
}

function createMockRes(): MockResponse {
  const json = vi.fn();

  const response = {
    json,
    locals: {},
  } as unknown as MockResponse;

  response.status = vi.fn(() => response);

  return response;
}

function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe("getAccountWorkspacesController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and workspaces for a valid userId", async () => {
    const req = {
      params: {
        userId: "user-1",
      },
    } as unknown as Request;

    const res = createMockRes();
    const next = createMockNext();

    const mockedWorkspaceService = workspaceService as unknown as {
      listWorkspacesForAccount: Mock<
        (userId: string) => Promise<WorkspaceRecord[]>
      >;
    };

    const workspaces: WorkspaceRecord[] = [
      {
        id: "w-1",
        name: "Workspace 1",
        createdBy: "u1",
        createdAt: new Date().toISOString(),
      },
    ];

    mockedWorkspaceService.listWorkspacesForAccount.mockResolvedValueOnce(
      workspaces,
    );

    await getAccountWorkspacesController(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      workspaces: [
        {
          id: "w-1",
          name: "Workspace 1",
          createdBy: "u1",
          createdAt: expect.any(String),
        },
      ],
    });

    expect(
      mockedWorkspaceService.listWorkspacesForAccount,
    ).toHaveBeenCalledWith("user-1");
  });

  it("calls next with AppError when userId is missing", async () => {
    const req = {
      params: {
        userId: "",
      },
    } as unknown as Request;

    const res = createMockRes();
    const next = createMockNext();

    const nextSpy = next as Mock;

    await getAccountWorkspacesController(req, res, next);

    expect(nextSpy).toHaveBeenCalled();

    const firstCall = nextSpy.mock.calls[0];

    expect(firstCall).toBeDefined();
    expect(firstCall?.[0]).toBeInstanceOf(Error);
  });
});