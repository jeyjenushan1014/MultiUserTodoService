import { describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn<(key: string) => Promise<string | null>>() }));
vi.mock("../../../../config/cache.js", () => ({
  cache: { isReady: true, get, set: vi.fn(), del: vi.fn() },
}));
vi.mock("../postgres.todo.cache.version.js", () => ({
  getDurableTodoCacheVersion: () => Promise.resolve("1"),
}));

import { RedisTodoReadCache } from "../redis.todo.read.cache.js";

describe("Redis cursor cache read", () => {
  it("returns nextCursor from the production cache-hit mapper", async () => {
    const payload = { items: [], totalItems: 10, nextCursor: "opaque-position" };
    get.mockImplementation((key) => Promise.resolve(key.startsWith("todo:version:") ? "1" : JSON.stringify(payload)));
    const result = await new RedisTodoReadCache().lookupList({
      ownerId: "11111111-1111-4111-8111-111111111111",
      page: 1, pageSize: 20, access: "owned", sortBy: "createdAt", sortOrder: "desc",
    });
    expect(result?.value).toEqual(payload);
  });
});
