import { beforeEach, describe, expect, it, vi } from "vitest";

import { processWorkspaceMembershipEventObject } from "../workspace-membership.consumer.js";

vi.mock("../workspace-membership.cache.js", () => ({
  cacheMembership: vi.fn(),
  removeMembership: vi.fn(),
}));

import {
  cacheMembership,
  removeMembership,
} from "../workspace-membership.cache.js";

describe("workspace-membership consumer (gateway)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caches membership when role present", async () => {
    const payload = {
      eventType: "workspace.membership-changed",
      payload: {
        workspaceId: "w1",
        userId: "u1",
        role: "editor",
        changedAt: new Date().toISOString(),
      },
    };

    await processWorkspaceMembershipEventObject(payload);

    expect(cacheMembership).toHaveBeenCalledWith(
      "u1",
      "w1",
      "editor",
    );
    expect(removeMembership).not.toHaveBeenCalled();
  });

    it("removes membership when role is null", async () => {
    const payload = {
      eventType: "workspace.membership-changed",
      payload: {
        workspaceId: "w2",
        userId: "u2",
        role: null,
        changedAt: new Date().toISOString(),
      },
    };

    await processWorkspaceMembershipEventObject(payload);

      expect(removeMembership).toHaveBeenCalledWith("u2", "w2", expect.any(Number));
    expect(cacheMembership).not.toHaveBeenCalled();
  });

  it("throws on invalid shape", async () => {
    await expect(
      processWorkspaceMembershipEventObject({}),
    ).rejects.toBeDefined();
  });
});