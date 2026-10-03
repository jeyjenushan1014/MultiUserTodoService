import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../config/database.js", () => ({ database: { query: mocks.query } }));
import { PostgresNotificationDeliveryRepository } from "../postgres-notification-delivery.repository.js";

describe("notification replay publisher/consumer handoff", () => {
  beforeEach(() => mocks.query.mockReset());

  it("allows a consumer to claim a replay before the publisher records confirmation", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ claimed: true, status: "processing", attempts: 1 }] });
    const result = await new PostgresNotificationDeliveryRepository().claim("event", 1);
    expect(result.status).toBe("claimed");
    expect(mocks.query.mock.calls[0]?.[0]).toContain("status IN ('replay_queued', 'replay_publishing')");
  });

  it("does not overwrite progress when the consumer wins the confirmation race", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0 });
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ status: "sent" }] });
    await expect(new PostgresNotificationDeliveryRepository().markReplayQueued("event", "token"))
      .resolves.toBeUndefined();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("still fails explicitly for a lost lease without consumer progress", async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 0 });
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(new PostgresNotificationDeliveryRepository().markReplayQueued("event", "token"))
      .rejects.toThrow("lost its replay lease");
  });
});
