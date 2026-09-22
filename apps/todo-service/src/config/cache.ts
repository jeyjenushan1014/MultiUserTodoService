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

    disableOfflineQueue:
      true,

    socket: {
      connectTimeout:
        5000,

      reconnectStrategy(
        retries: number,
      ): number {
        return Math.min(
          100 * 2 ** retries,
          5000,
        );
      },
    },
  });

cache.on(
  "error",
  (error: Error) => {
    logger.warn(
      {
        err: error,
      },
      "TODO cache connection error",
    );
  },
);

cache.on(
  "reconnecting",
  () => {
    logger.warn(
      "TODO cache reconnecting",
    );
  },
);

cache.on(
  "ready",
  () => {
    logger.info(
      "TODO cache connected",
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