import type {
  HealthResponse,
} from "@todo/contracts";

import {
  checkDatabaseHealth,
} from "../../config/database.js";

export async function getAccountServiceHealth():
  Promise<HealthResponse> {
  const databaseAvailable =
    await checkDatabaseHealth();

  if (!databaseAvailable) {
    return {
      status: "unhealthy",
      service: "account-service",
      dependencies: {
        database: "unavailable",
      },
    };
  }

  return {
    status: "healthy",
    service: "account-service",
    dependencies: {
      database: "available",
    },
  };
}