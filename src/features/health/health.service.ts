import * as healthRepository from "./health.repository.js";

export interface HealthResult {
  status: "available" | "degraded";

  checks: {
    service: "available";
    database: "available" | "unavailable";
    cache: "available" | "unavailable";
  };
}

export async function checkHealth(): Promise<HealthResult> {
  const [databaseAvailable, cacheAvailable] =
    await Promise.all([
      healthRepository.isDatabaseAvailable(),
      healthRepository.isCacheAvailable(),
    ]);

  return {
    status: databaseAvailable
      ? "available"
      : "degraded",

    checks: {
      service: "available",

      database: databaseAvailable
        ? "available"
        : "unavailable",

      cache: cacheAvailable
        ? "available"
        : "unavailable",
    },
  };
}