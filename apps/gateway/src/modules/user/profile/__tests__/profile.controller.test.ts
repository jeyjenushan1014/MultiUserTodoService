import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestAccountDeletion: vi.fn(),
  getCurrentAccount: vi.fn(),
  getCallerIdentity: vi.fn(),
  cacheAccountRevoked: vi.fn(),
}));

vi.mock("@todo/common", () => ({
  getRequestId: () => "request-id",
}));
vi.mock("../../../../clients/account-service.client.js", () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  requestAccountDeletion: mocks.requestAccountDeletion,
}));
vi.mock("../../../../middleware/authenticate.middleware.js", () => ({
  getCallerIdentity: mocks.getCallerIdentity,
}));
vi.mock("../../../../security/session-revocation.cache.js", () => ({
  cacheAccountRevoked: mocks.cacheAccountRevoked,
}));

import { requestAccountDeletion } from "../profile.controller.js";

describe("requestAccountDeletion", () => {
  it("revokes the account in the Gateway cache before returning accepted", async () => {
    const identity = {
      userId: "account-id",
      sessionId: "session-id",
      email: "user@example.com",
      accessTokenIssuedAt: 1_790_000_000,
    };
    mocks.getCallerIdentity.mockReturnValue(identity);
    mocks.requestAccountDeletion.mockResolvedValue({
      data: { deletionRequestId: "deletion-id", status: "pending" },
    });
    mocks.cacheAccountRevoked.mockResolvedValue(undefined);

    const request = {
      header: vi.fn(() => "deletion-key-123"),
    } as unknown as Request;
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const response = {
      status,
      json,
    } as unknown as Response;

    await requestAccountDeletion(request, response, vi.fn());

    expect(mocks.requestAccountDeletion).toHaveBeenCalledWith(identity, "deletion-key-123", "request-id");
    expect(mocks.cacheAccountRevoked).toHaveBeenCalledWith("account-id", expect.any(Number));
    expect(mocks.requestAccountDeletion.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cacheAccountRevoked.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith({
      data: { deletionRequestId: "deletion-id", status: "pending" },
    });
  });
});