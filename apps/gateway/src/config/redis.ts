import {
  createClient,
} from "redis";

import {
  env,
} from "./env.js";

import {
  logger,
} from "./logger.js";

export const redis = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (
      retryCount,
    ): number => {
      return Math.min(
        retryCount * 100,
        3000,
      );
    },
  },
});

redis.on(
  "error",
  (error): void => {
    logger.warn(
      {
        error,
      },
      "Redis connection error",
    );
  },
);

redis.on(
  "ready",
  (): void => {
    logger.info(
      "Redis connection is ready",
    );
  },
);

redis.on(
  "reconnecting",
  (): void => {
    logger.warn(
      "Redis connection is reconnecting",
    );
  },
);

export async function connectRedis():
Promise<void> {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function disconnectRedis():
Promise<void> {
  if (redis.isOpen) {
    await redis.quit();
  }
}