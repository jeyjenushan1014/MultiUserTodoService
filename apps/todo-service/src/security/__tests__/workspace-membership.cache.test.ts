import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
  mGet: vi.fn(),
  isReady: true,
}));

vi.mock("../../config/cache.js", () => ({
  cache: {
    set: cacheMocks.set,
    del: cacheMocks.del,
    get: cacheMocks.get,
    eval: cacheMocks.eval,
    mGet: cacheMocks.mGet,

    get isReady() {
      return cacheMocks.isReady;
    },
  },
}));

import { cache } from "../../config/cache.js";
import { env } from "../../config/env.js";

import {
  cacheMembership,
  removeMembership,
  getMembershipRole,
  getWorkspaceAuthorization,
} from "../workspace-membership.cache.js";

describe("todo-service workspace-membership.cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheMocks.isReady = true;
  });

  it("applies membership changes atomically with event timestamp ordering", async () => {
    const changedAt = 1_695_000_000_000;

    await cacheMembership("u1", "w1", "viewer", changedAt);

    expect(cache.eval).toHaveBeenCalledWith(
      expect.stringContaining("currentVersion"),
      {
        keys: [
          "workspace.membership:u1:w1",
          "workspace.revoked:u1:w1",
          "workspace.membership-version:u1:w1",
        ],
        arguments: [
          String(changedAt),
          "viewer",
          String(Math.floor(changedAt / 1000)),
          String(env.WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS),
        ],
      },
    );
  });

  it("applies removal and records revoked-before atomically", async () => {
    const epoch = 1_695_000_000;

    await removeMembership("u2", "w2", epoch, epoch * 1000);

    expect(cache.eval).toHaveBeenCalledWith(
      expect.stringContaining("currentVersion"),
      expect.objectContaining({
        keys: [
          "workspace.membership:u2:w2",
          "workspace.revoked:u2:w2",
          "workspace.membership-version:u2:w2",
        ],
        arguments: [
          String(epoch * 1000),
          "",
          String(epoch),
          String(env.WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS),
        ],
      }),
    );
  });

  it("fails closed when Redis is not ready", async () => {
    cacheMocks.isReady = false;

    await expect(
      getMembershipRole("u3", "w3"),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "WORKSPACE_PROJECTION_UNAVAILABLE",
    });
  });

  it("reads role and revoked-before as one snapshot", async () => {
    cacheMocks.isReady = true;
    cacheMocks.mGet.mockResolvedValue(["viewer", "12345"]);

    await expect(
      getWorkspaceAuthorization("u4", "w4"),
    ).resolves.toEqual({
      role: "viewer",
      revokedBefore: 12345,
    });
  });
});