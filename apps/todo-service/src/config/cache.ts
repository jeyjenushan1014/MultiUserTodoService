import {
  createClient,
} from "redis";

import {
  env,
} from "./env.js";

import {
  logger,
} from "./logger.js";

export const cache =
  createClient({
    url:
      env.REDIS_URL,

    socket: {
      connectTimeout:
        env.REDIS_CONNECT_TIMEOUT_MS,

      reconnectStrategy(
        retries,
      ): number {
        return Math.min(
          retries * 100,
          3000,
        );
      },
    },

    disableOfflineQueue:
      true,
  });

cache.on(
  "error",
  (error: unknown) => {
    logger.warn(
      {
        error,
      },
      "Redis client error",
    );
  },
);

cache.on(
  "reconnecting",
  () => {
    logger.warn(
      "Redis client reconnecting",
    );
  },
);

cache.on(
  "ready",
  () => {
    logger.info(
      "Redis client ready",
    );
  },
);

export async function connectCache():
  Promise<void> {
  if (
    cache.isOpen ||
    cache.isReady
  ) {
    return;
  }

  await cache.connect();
}

export async function isCacheAvailable():
Promise<boolean> {
  if (!cache.isReady) {
    return false;
  }

  try {
    return (
      await cache.ping()
    ) === "PONG";
  } catch (error) {
    logger.warn(
      {
        err: error,
      },
      "TODO cache health check failed",
    );

    return false;
  }
}