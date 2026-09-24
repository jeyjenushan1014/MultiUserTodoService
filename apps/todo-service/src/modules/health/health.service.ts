import type {
  HealthResponse,
} from "@todo/contracts";

import type {
  HealthDependencyProbe,
} from "./health.probe.js";

export interface ReadinessResult {
  readonly statusCode:
    200 | 503;

  readonly body:
    HealthResponse;
}

export class HealthService {
  public constructor(
    private readonly probe:
      HealthDependencyProbe,
  ) {}

  public getLiveness():
  HealthResponse {
    return {
      status:
        "healthy",

      service:
        "todo-service",
    };
  }

  public async getReadiness():
  Promise<ReadinessResult> {
    const [
      databaseAvailable,
      cacheAvailable,
    ] =
      await Promise.all([
        this.probe
          .databaseAvailable(),

        this.probe
          .cacheAvailable(),
      ]);

    if (!databaseAvailable) {
      return {
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
              cacheAvailable
                ? "available"
                : "unavailable",
          },
        },
      };
    }

    if (!cacheAvailable) {
      return {
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
      };
    }

    return {
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
    };
  }
}