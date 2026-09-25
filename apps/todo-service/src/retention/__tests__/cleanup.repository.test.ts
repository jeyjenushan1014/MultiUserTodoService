import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  TodoCleanupRepository,
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

describe("TodoCleanupRepository", () => {
  beforeEach(() => {
    clientMocks.query.mockReset();
    clientMocks.release.mockReset();
    clientMocks.query.mockResolvedValue({ rowCount: 0 });
  });

  it("deletes only processed and published rows in bounded batches", async () => {
    const repository = new TodoCleanupRepository();
    const cutoffs = {
      event: new Date("2026-01-01T00:00:00.000Z"),
      outbox: new Date("2026-02-01T00:00:00.000Z"),
    };

    await repository.cleanup(cutoffs, 11);

    const deleteCalls = clientMocks.query.mock.calls.filter(
      ([query]) => typeof query === "string" && query.startsWith("DELETE"),
    );

    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0]?.[0]).toContain("processed_at < $1");
    expect(deleteCalls[1]?.[0]).toContain("published_at IS NOT NULL");
    expect(deleteCalls[1]?.[0]).toContain("published_at < $1");
    expect(deleteCalls.map(([, parameters]) => parameters as unknown)).toEqual([
      [cutoffs.event, 11],
      [cutoffs.outbox, 11],
    ]);
    expect(clientMocks.query).toHaveBeenCalledWith("COMMIT");
    expect(clientMocks.release).toHaveBeenCalledOnce();
  });
});