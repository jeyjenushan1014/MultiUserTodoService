import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWithRequestContext } from "@todo/common";
import type { RegisterAccountResponse, RegisteredAccount } from "@todo/contracts";

const { registerAccountMock } = vi.hoisted(() => ({
  registerAccountMock: vi.fn(),
}));

vi.mock("../../../../clients/account-service.client.js", () => ({
  registerAccount: registerAccountMock,
}));

import { register } from "../registration.controller.js";

describe("public registration compatibility across service versions (EV-7, EV-8)", () => {
  beforeEach(() => {
    registerAccountMock.mockReset();
  });

  it("adds legacy response fields when the downstream Account Service is an older version", async () => {
    const user: RegisteredAccount = {
      id: "4d395a15-853a-4d2f-93d5-041868663cd2",
      email: "alice@example.com",
      createdAt: "2026-10-01T10:00:00.000Z",
    };

    // This is the response shape emitted by the previous Account Service version.
    const oldAccountServiceResponse = {
      data: { user },
    } as RegisterAccountResponse;
    registerAccountMock.mockResolvedValue(oldAccountServiceResponse);

    const status = vi.fn();
    const json = vi.fn();
    const response = { status, json } as unknown as Response;
    status.mockReturnValue(response);

    await runWithRequestContext(
      {
        requestId: "c76546ac-e520-4be1-a6cb-e03b31813ec3",
        serviceName: "gateway",
      },
      () => register(
        { body: { email: user.email, password: "not-returned" } } as Request,
        response,
        vi.fn(),
      ),
    );

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({
      data: {
        ...user,
        user,
      },
    });
    expect(json.mock.calls[0]?.[0]).not.toHaveProperty("data.password");
  });
});
