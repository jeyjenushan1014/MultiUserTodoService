import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMocks = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  eval: vi.fn(),
  mGet: vi.fn(),
  isReady: true,
}));

vi.mock("../../config/redis.js", () => ({
  redis: {
    set: redisMocks.set,
    del: redisMocks.del,
    get: redisMocks.get,
    eval: redisMocks.eval,
    mGet: redisMocks.mGet,

    get isReady() {
      return redisMocks.isReady;
    },
  },
}));

import { redis } from "../../config/redis.js";
import { env } from "../../config/env.js";

import {
  cacheMembership,
  removeMembership,
  getMembershipRole,
  getWorkspaceAuthorization,
} from "../workspace-membership.cache.js";

describe("gateway workspace-membership.cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.isReady = true;
  });

  it("applies membership changes atomically with event timestamp ordering", async () => {
    const changedAt = 1_695_000_000_000;

    await cacheMembership("u1", "w1", "editor", changedAt);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("currentVersion"),
      {
        keys: [
          "workspace.membership:u1:w1",
          "workspace.revoked:u1:w1",
          "workspace.membership-version:u1:w1",
        ],
        arguments: [
          String(changedAt),
          "editor",
          String(Math.floor(changedAt / 1000)),
          String(env.WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS),
        ],
      },
    );
  });

  it("applies removal and records revoked-before atomically", async () => {
    const epoch = 1_695_000_000;

    await removeMembership("u2", "w2", epoch, epoch * 1000);

    expect(redis.eval).toHaveBeenCalledWith(
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
    redisMocks.isReady = false;

    await expect(
      getMembershipRole("u3", "w3"),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "WORKSPACE_PROJECTION_UNAVAILABLE",
    });
  });

  it("reads role and revoked-before as one snapshot", async () => {
    redisMocks.isReady = true;

    redisMocks.mGet.mockResolvedValue(["editor", "54321"]);

    await expect(
      getWorkspaceAuthorization("u4", "w4"),
    ).resolves.toEqual({
      role: "editor",
      revokedBefore: 54321,
    });
  });
});