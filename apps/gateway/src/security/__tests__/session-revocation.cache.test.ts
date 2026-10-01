import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ set: vi.fn(), del: vi.fn(), get: vi.fn(), isReady: true }));

vi.mock("../../config/redis.js", () => ({
  redis: {
    set: mocks.set,
    del: mocks.del,
    get: mocks.get,
    get isReady() { return mocks.isReady; },
  },
}));
vi.mock("../../config/env.js", () => ({
  env: {
    INTERNAL_SERVICE_SECRET: "test-internal-service-secret-with-more-than-32-characters",
    SESSION_REVOCATION_CACHE_TTL_SECONDS: 900,
  },
}));
vi.mock("../../config/logger.js", () => ({ logger: { warn: vi.fn() } }));

import {
  cacheAccountRevoked,
  cacheSessionRevoked,
  purgeLegacyAccountRevocation,
  purgeSessionRevocationCaches,
} from "../session-revocation.cache.js";

describe("session revocation cache account key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a keyed digest instead of the raw account identifier", async () => {
    await cacheAccountRevoked("account-id", 1_790_000_000);
    const digest = createHmac("sha256", "test-internal-service-secret-with-more-than-32-characters")
      .update("account-id")
      .digest("hex");
    expect(mocks.set).toHaveBeenCalledWith("account-revoked:" + digest, "1790000000", {
      expiration: { type: "EX", value: 900 },
    });
  });

  it("removes the legacy raw account key", async () => {
    await purgeLegacyAccountRevocation("account-id");
    expect(mocks.del).toHaveBeenCalledWith("account-revoked:account-id");
  });

  it("stores session revocation under a keyed digest and purges legacy keys", async () => {
    await cacheSessionRevoked("session-id", 1_790_000_000);
    const digest = createHmac("sha256", "test-internal-service-secret-with-more-than-32-characters")
      .update("session-id")
      .digest("hex");
    expect(mocks.set).toHaveBeenCalledWith("session-revoked:" + digest, "1790000000", {
      expiration: { type: "EX", value: 900 },
    });

    await purgeSessionRevocationCaches(["session-id"]);
    expect(mocks.del).toHaveBeenCalledWith([`session-revoked:${digest}`, "session-revoked:session-id"]);
  });
});