import type {
  HealthResponse,
} from "@todo/contracts";

import {
  env,
} from "../../config/env.js";

import {
  redis,
} from "../../config/redis.js";

export function getGatewayHealth():
  HealthResponse {
  return {
    status: "healthy",
    service: "gateway",
  };
}

export interface GatewayDependencyHealth {
  readonly status:
    "healthy" | "degraded";

  readonly service:
    "gateway";

  readonly dependencies: {
    readonly redis:
      "available" | "unavailable";

    readonly accountService:
      "available" | "unavailable";

    readonly todoService:
      "available" | "unavailable";
  };
}

async function probe(
  url: string,
): Promise<boolean> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      env.DOWNSTREAM_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,
        },
      );

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function getGatewayDependencyHealth():
Promise<GatewayDependencyHealth> {
  const [accountAvailable, todoAvailable] =
    await Promise.all([
      probe(
        `${env.ACCOUNT_SERVICE_URL}/health`,
      ),
      probe(
        `${env.TODO_SERVICE_URL}/health/ready`,
      ),
    ]);

  const redisAvailable =
    redis.isReady;

  return {
    status:
      accountAvailable &&
      todoAvailable &&
      redisAvailable
        ? "healthy"
        : "degraded",

    service:
      "gateway",

    dependencies: {
      redis:
        redisAvailable
          ? "available"
          : "unavailable",

      accountService:
        accountAvailable
          ? "available"
          : "unavailable",

      todoService:
        todoAvailable
          ? "available"
          : "unavailable",
    },
  };
}