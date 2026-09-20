import {
  env,
} from "../../config/env.js";

import {
  redis,
} from "../../config/redis.js";

export interface DependencyHealth {
  readonly status:
    | "available"
    | "unavailable";
}

export interface GatewayHealth {
  readonly status:
    | "healthy"
    | "degraded"
    | "unhealthy";

  readonly service: "gateway";

  readonly dependencies: {
    readonly redis:
      DependencyHealth;

    readonly accountService:
      DependencyHealth;
  };
}

async function checkAccountService():
Promise<DependencyHealth> {
  try {
    const response = await fetch(
      `${env.ACCOUNT_SERVICE_URL}/health/ready`,
      {
        signal:
          AbortSignal.timeout(
            env.DOWNSTREAM_TIMEOUT_MS,
          ),
      },
    );

    return {
      status: response.ok
        ? "available"
        : "unavailable",
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

async function checkRedis():
Promise<DependencyHealth> {
  if (!redis.isReady) {
    return {
      status: "unavailable",
    };
  }

  try {
    await redis.ping();

    return {
      status: "available",
    };
  } catch {
    return {
      status: "unavailable",
    };
  }
}

export async function getGatewayHealth():
Promise<GatewayHealth> {
  const [
    redisHealth,
    accountServiceHealth,
  ] = await Promise.all([
    checkRedis(),
    checkAccountService(),
  ]);

  const allAvailable =
    redisHealth.status === "available" &&
    accountServiceHealth.status ===
      "available";

  return {
    status: allAvailable
      ? "healthy"
      : "degraded",

    service: "gateway",

    dependencies: {
      redis: redisHealth,
      accountService:
        accountServiceHealth,
    },
  };
}