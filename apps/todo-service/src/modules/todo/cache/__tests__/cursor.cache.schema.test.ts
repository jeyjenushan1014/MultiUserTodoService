import { describe, expect, it } from "vitest";
import { cachedListResultSchema } from "../todo.cache.schema.js";

describe("cursor list cache schema", () => {
  it("preserves nextCursor rather than discarding the cached page", () => {
    const page = { items: [], totalItems: 10, nextCursor: "opaque-position" };
    expect(cachedListResultSchema.parse(page)).toEqual(page);
  });

  it("supports terminal pages without a nextCursor", () => {
    const page = { items: [], totalItems: 0 };
    expect(cachedListResultSchema.parse(page)).toEqual(page);
  });
});
