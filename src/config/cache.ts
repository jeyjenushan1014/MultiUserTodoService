/*
This file is responsible for configuring the Redis cache client. 
*/

import { createClient } from "redis";
import { env } from "./env.js";

export const cache = createClient({
  url: env.REDIS_URL,
});

// Connect to the Redis cache when the application starts. This function can be called in the main application entry point to ensure that the cache is connected.
export async function connectCache(): Promise<void> {
  if (!cache.isOpen) {
    await cache.connect();
  }
}