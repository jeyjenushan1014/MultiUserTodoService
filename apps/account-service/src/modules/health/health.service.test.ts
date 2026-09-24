import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  checkDatabaseHealth,
} from "../../config/database.js";

import {
  getAccountServiceHealth,
} from "./health.service.js";

vi.mock(
  "../../config/database.js",
  (): {
    checkDatabaseHealth:
      ReturnType<typeof vi.fn>;
  } => ({
    checkDatabaseHealth:
      vi.fn(),
  }),
);

const mockedCheckDatabaseHealth =
  vi.mocked(
    checkDatabaseHealth,
  );

describe("getAccountServiceHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy when PostgreSQL is available", async () => {
    mockedCheckDatabaseHealth
      .mockResolvedValue(true);

    await expect(
      getAccountServiceHealth(),
    ).resolves.toEqual({
      status: "healthy",
      service:
        "account-service",
      dependencies: {
        database:
          "available",
      },
    });
  });

  it("returns unhealthy when PostgreSQL is unavailable", async () => {
    mockedCheckDatabaseHealth
      .mockResolvedValue(false);

    await expect(
      getAccountServiceHealth(),
    ).resolves.toEqual({
      status: "unhealthy",
      service:
        "account-service",
      dependencies: {
        database:
          "unavailable",
      },
    });
  });
});