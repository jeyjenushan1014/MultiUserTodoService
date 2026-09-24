/*
This file is responsible for configuring the Redis cache client. 
*/

import { createClient } from "redis";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const cache = createClient({
  url: env.REDIS_URL,

  // The reconnectStrategy option allows you to define a custom strategy for reconnecting to the Redis server in case of connection loss. 
  //In this case, the strategy is defined as a function that takes the number of retries as an argument and returns the delay (in milliseconds) before the next reconnection attempt.
  socket: {
    reconnectStrategy: (retries) => {
      return Math.min(retries * 100, 3000);
    },
  }
});

cache.on("connect", () => {
  logger.info("Redis connection established");
});

cache.on("ready", () => {
  logger.info("Redis is ready");
});

cache.on("reconnecting", () => {
  logger.warn("Redis is reconnecting");
});

cache.on("error", (error) => {
  logger.warn(
    { error },
    "Redis unavailable; database fallback will be used",
  );
});

// Connect to the Redis cache when the application starts. This function can be called in the main application entry point to ensure that the cache is connected.
export async function connectCache(): Promise<void> {
  if (!cache.isOpen) {
    await cache.connect();
  }
}