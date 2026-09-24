import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  HealthDependencyProbe,
} from "../health.probe.js";

import {
  HealthService,
} from "../health.service.js";

interface Dependencies {
  readonly databaseAvailableMock:
    ReturnType<
      typeof vi.fn<
        HealthDependencyProbe[
          "databaseAvailable"
        ]
      >
    >;

  readonly cacheAvailableMock:
    ReturnType<
      typeof vi.fn<
        HealthDependencyProbe[
          "cacheAvailable"
        ]
      >
    >;

  readonly service:
    HealthService;
}

function createDependencies():
Dependencies {
  const databaseAvailableMock =
    vi.fn<
      HealthDependencyProbe[
        "databaseAvailable"
      ]
    >();

  const cacheAvailableMock =
    vi.fn<
      HealthDependencyProbe[
        "cacheAvailable"
      ]
    >();

  const probe:
    HealthDependencyProbe = {
      databaseAvailable:
        databaseAvailableMock,

      cacheAvailable:
        cacheAvailableMock,
  };

  return {
    databaseAvailableMock,
    cacheAvailableMock,

    service:
      new HealthService(
        probe,
      ),
  };
}

describe(
  "HealthService",
  () => {
    it(
      "returns a healthy liveness response",
      () => {
        const dependencies =
          createDependencies();

        expect(
          dependencies
            .service
            .getLiveness(),
        ).toEqual({
          status:
            "healthy",

          service:
            "todo-service",
        });
      },
    );

    it(
      "returns healthy when database and cache are available",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .databaseAvailableMock
          .mockResolvedValue(true);

        dependencies
          .cacheAvailableMock
          .mockResolvedValue(true);

        await expect(
          dependencies
            .service
            .getReadiness(),
        ).resolves.toEqual({
          statusCode: 200,

          body: {
            status:
              "healthy",

            service:
              "todo-service",

            dependencies: {
              database:
                "available",

              cache:
                "available",
            },
          },
        });
      },
    );

    it(
      "returns degraded when only the cache is unavailable",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .databaseAvailableMock
          .mockResolvedValue(true);

        dependencies
          .cacheAvailableMock
          .mockResolvedValue(false);

        await expect(
          dependencies
            .service
            .getReadiness(),
        ).resolves.toEqual({
          statusCode: 200,

          body: {
            status:
              "degraded",

            service:
              "todo-service",

            dependencies: {
              database:
                "available",

              cache:
                "unavailable",
            },
          },
        });
      },
    );

    it(
      "returns unhealthy when the database is unavailable",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .databaseAvailableMock
          .mockResolvedValue(false);

        dependencies
          .cacheAvailableMock
          .mockResolvedValue(true);

        await expect(
          dependencies
            .service
            .getReadiness(),
        ).resolves.toEqual({
          statusCode: 503,

          body: {
            status:
              "unhealthy",

            service:
              "todo-service",

            dependencies: {
              database:
                "unavailable",

              cache:
                "available",
            },
          },
        });
      },
    );
  },
);