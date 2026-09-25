import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AccountCleanupRepository,
} from "../cleanup.repository.js";

const clientMocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../config/database.js", () => ({
  database: {
    connect: vi.fn(() => Promise.resolve(clientMocks)),
  },
}));

describe("AccountCleanupRepository", () => {
  beforeEach(() => {
    clientMocks.query.mockReset();
    clientMocks.release.mockReset();
    clientMocks.query.mockResolvedValue({ rowCount: 0 });
  });

  it("deletes only stale rows in bounded batches", async () => {
    const repository = new AccountCleanupRepository();
    const cutoffs = {
      session: new Date("2026-01-01T00:00:00.000Z"),
      token: new Date("2026-02-01T00:00:00.000Z"),
      outbox: new Date("2026-03-01T00:00:00.000Z"),
      notification: new Date("2026-04-01T00:00:00.000Z"),
    };

    await repository.cleanup(cutoffs, 7);

    const deleteCalls = clientMocks.query.mock.calls.filter(
      ([query]) => typeof query === "string" && query.startsWith("DELETE"),
    );

    expect(deleteCalls).toHaveLength(5);
    expect(deleteCalls[0]?.[0]).toContain("expires_at < $1 OR used_at < $1");
    expect(deleteCalls[1]?.[0]).toContain("revoked_at < $1");
    expect(deleteCalls[1]?.[0]).toContain("rt.used_at IS NULL");
    expect(deleteCalls[2]?.[0]).toContain("expires_at < $1 OR used_at < $1");
    expect(deleteCalls[3]?.[0]).toContain("published_at IS NOT NULL");
    expect(deleteCalls[3]?.[0]).toContain("published_at < $1");
    expect(deleteCalls[4]?.[0]).toContain("status <> 'processing'");
    expect(deleteCalls[4]?.[0]).toContain("updated_at < $1");

    expect(deleteCalls.map(([, parameters]) => parameters as unknown)).toEqual([
      [cutoffs.token, 7],
      [cutoffs.session, 7],
      [cutoffs.token, 7],
      [cutoffs.outbox, 7],
      [cutoffs.notification, 7],
    ]);
    expect(clientMocks.query).toHaveBeenCalledWith("COMMIT");
    expect(clientMocks.release).toHaveBeenCalledOnce();
  });
});