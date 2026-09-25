import {
  createClient,
} from "redis";

import {
  env,
} from "./env.js";

import {
  logger,
} from "./logger.js";

export function redisReconnectStrategy(
  retries:
    number,
): number {
  return Math.min(
    retries * 100,
    3_000,
  );
}

/*
Converts an unknown thrown value into an Error
instance suitable for structured logging.
*/
function normalizeError(
  value:
    unknown,
): Error {
  if (
    value instanceof Error
  ) {
    return value;
  }

  return new Error(
    typeof value ===
      "string"
      ? value
      : "Unknown Redis error",
  );
}

export const redis =
  createClient({
    url:
      env.REDIS_URL,

    socket: {
      connectTimeout:
        5_000,

      reconnectStrategy(
        retries:
          number,
      ): number {
        return redisReconnectStrategy(
          retries,
        );
      },
    },
  });

/*
The Redis event emitter may expose its error argument
without a safe inferred type. It is therefore treated
as unknown and normalized before logging.
*/
redis.on(
  "error",
  (
    error:
      unknown,
  ): void => {
    logger.warn(
      {
        err:
          normalizeError(
            error,
          ),

        dependency:
          "redis",
      },
      "Gateway Redis connection error",
    );
  },
);

redis.on(
  "reconnecting",
  (): void => {
    logger.warn(
      {
        dependency:
          "redis",
      },
      "Gateway Redis reconnecting",
    );
  },
);

redis.on(
  "ready",
  (): void => {
    logger.info(
      {
        dependency:
          "redis",
      },
      "Gateway Redis connection ready",
    );
  },
);

export async function connectRedis():
  Promise<void> {
  if (
    redis.isOpen
  ) {
    return;
  }

  await redis.connect();
}

export async function disconnectRedis():
  Promise<void> {
  if (!redis.isOpen) {
    return;
  }

  await redis.quit();
}