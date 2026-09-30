import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Channel, ConsumeMessage } from "amqplib";

import {
  handleWorkspaceMembershipMessage,
  processWorkspaceMembershipEventObject,
} from "../workspace-membership.consumer.js";

vi.mock("../../security/workspace-membership.cache.js", () => ({
  cacheMembership: vi.fn(),
  removeMembership: vi.fn(),
}));

import {
  cacheMembership,
  removeMembership,
} from "../../security/workspace-membership.cache.js";

describe("workspace-membership consumer (todo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caches membership when role present", async () => {
    const payload = {
      eventType: "workspace.membership-changed",
      payload: {
        workspaceId: "w1",
        userId: "u1",
        role: "viewer",
        changedAt: new Date().toISOString(),
      },
    };

    await processWorkspaceMembershipEventObject(payload);

    expect(cacheMembership).toHaveBeenCalledWith(
      "u1",
      "w1",
      "viewer",
      Date.parse(payload.payload.changedAt),
    );

    expect(removeMembership).not.toHaveBeenCalled();
  });

  it("removes membership when role is null", async () => {
    const changedAt = "2026-09-30T12:00:00.000Z";

    const payload = {
      eventType: "workspace.membership-changed",
      payload: {
        workspaceId: "w2",
        userId: "u2",
        role: null,
        changedAt,
      },
    };

    await processWorkspaceMembershipEventObject(payload);

    const expectedEpoch = Math.floor(
      new Date(changedAt).getTime() / 1000,
    );

    expect(removeMembership).toHaveBeenCalledWith(
      "u2",
      "w2",
      expectedEpoch,
      Date.parse(changedAt),
    );

    expect(cacheMembership).not.toHaveBeenCalled();
  });

  it("throws on invalid shape", async () => {
    await expect(
      processWorkspaceMembershipEventObject({}),
    ).rejects.toBeDefined();
  });

  it("acks only after the projection write resolves", async () => {
    const order: string[] = [];

    vi.mocked(cacheMembership).mockImplementationOnce(() => {
      order.push("write");
      return Promise.resolve();
    });

    const message = {
      content: Buffer.from(
        JSON.stringify({
          eventType: "workspace.membership-changed",
          payload: {
            workspaceId: "w1",
            userId: "u1",
            role: "viewer",
            changedAt: "2026-09-30T12:00:00.000Z",
          },
        }),
      ),
    } as ConsumeMessage;

    const ackMock = vi.fn(() => {
      order.push("ack");
    });

    const nackMock = vi.fn();

    const channel = {
      ack: ackMock,
      nack: nackMock,
    } as unknown as Channel;

    await handleWorkspaceMembershipMessage(channel, message);

    expect(order).toEqual(["write", "ack"]);
    expect(nackMock).not.toHaveBeenCalled();
  });

  it("requeues when a projection write fails and never acks", async () => {
    vi.mocked(cacheMembership).mockRejectedValueOnce(
      new Error("Redis unavailable"),
    );

    const message = {
      content: Buffer.from(
        JSON.stringify({
          eventType: "workspace.membership-changed",
          payload: {
            workspaceId: "w1",
            userId: "u1",
            role: "viewer",
            changedAt: "2026-09-30T12:00:00.000Z",
          },
        }),
      ),
    } as ConsumeMessage;

    const ackMock = vi.fn();
    const nackMock = vi.fn();

    const channel = {
      ack: ackMock,
      nack: nackMock,
    } as unknown as Channel;

    await handleWorkspaceMembershipMessage(channel, message);

    expect(ackMock).not.toHaveBeenCalled();
    expect(nackMock).toHaveBeenCalledWith(message, false, true);
  });
});