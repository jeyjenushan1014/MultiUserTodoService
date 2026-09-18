import { cache } from "../../config/cache.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type {
  ListTodoQuery,
} from "./todo.types.js";


const CACHE_VERSION_PREFIX = "todo:version";
const TODO_CACHE_PREFIX = "todo";
const CACHE_BLOCK_PREFIX = "todo:cache-blocked";

//temporarilyBlockedUsers is a Map that keeps track of users who have been temporarily blocked from using the cache. 
//The key is the userId, and the value is the timestamp (in milliseconds) until which the user is blocked.
//cache todoItem use this format this prevents cannot be used other user items : todo:{userId}:{version}:item:{todoId}
//cache todoList use this format this prevents cannot be used other user items : todo:{userId}:{version}:list:{query}
const temporarilyBlockedUsers =
  new Map<string, number>();

function getVersionKey(userId: string): string {
  return `${CACHE_VERSION_PREFIX}:${userId}`;
}

function getCacheBlockKey(userId: string): string {
  return `${CACHE_BLOCK_PREFIX}:${userId}`;
}

function blockUserCacheLocally(userId: string): void {
  const blockedUntil =
    Date.now() + env.CACHE_TTL_SECONDS * 1000;

  temporarilyBlockedUsers.set(
    userId,
    blockedUntil,
  );

  const expiryTimer = setTimeout(() => {
    if (
      temporarilyBlockedUsers.get(userId) ===
      blockedUntil
    ) {
      temporarilyBlockedUsers.delete(userId);
    }
  }, env.CACHE_TTL_SECONDS * 1000);

  expiryTimer.unref();
}

async function blockUserCache(userId: string): Promise<void> {
  blockUserCacheLocally(userId);

  if (!cache.isReady) {
    return;
  }

  try {
    await cache.set(
      getCacheBlockKey(userId),
      "1",
      {
        EX: env.CACHE_TTL_SECONDS,
      },
    );
  } catch (error) {
    logger.warn(
      {
        error,
        userId,
      },
      "Shared cache block marker could not be written",
    );
  }
}

//isUserCacheBlocked checks if a user is currently blocked from using the cache.
async function isUserCacheBlocked(
  userId: string,
): Promise<boolean> {
  const blockedUntil =
    temporarilyBlockedUsers.get(userId);

  if (
    blockedUntil !== undefined &&
    Date.now() >= blockedUntil
  ) {
    temporarilyBlockedUsers.delete(userId);
  }

  if (
    blockedUntil !== undefined &&
    Date.now() < blockedUntil
  ) {
    return true;
  }

  if (!cache.isReady) {
    return false;
  }

  try {
    return (await cache.exists(
      getCacheBlockKey(userId),
    )) === 1;
  } catch {
    return false;
  }
}

async function unblockUserCache(userId: string): Promise<void> {
  temporarilyBlockedUsers.delete(userId);

  if (!cache.isReady) {
    return;
  }

  try {
    await cache.del(getCacheBlockKey(userId));
  } catch (error) {
    logger.warn(
      {
        error,
        userId,
      },
      "Shared cache block marker could not be cleared",
    );
  }
}

async function getCacheVersion(
  userId: string,
): Promise<string> {
  if (!cache.isReady) {
    return "unavailable";
  }

  const version = await cache.get(
    getVersionKey(userId),
  );

  return version ?? "0";
}

export async function buildTodoItemCacheKey(
  userId: string,
  todoId: string,
): Promise<string> {
  const version =
    await getCacheVersion(userId);

  return `${TODO_CACHE_PREFIX}:${userId}:${version}:item:${todoId}`;
}

export async function buildTodoListCacheKey(
  userId: string,
  queryIdentifier: string,
): Promise<string> {
  const version =
    await getCacheVersion(userId);

  return `${TODO_CACHE_PREFIX}:${userId}:${version}:list:${queryIdentifier}`;
}

export async function getCachedValue<T>(
  userId: string,
  key: string,
): Promise<T | undefined> {
  if (
    !cache.isReady ||
    await isUserCacheBlocked(userId)
  ) {
    logger.info(
      {
        cacheKey: key,
        cacheHit: false,
        cacheAvailable: cache.isReady,
      },
      "Cache bypassed",
    );

    return undefined;
  }

  try {
    const value = await cache.get(key);

    if (value === null) {
      logger.info(
        {
          cacheKey: key,
          cacheHit: false,
        },
        "Cache miss",
      );

      return undefined;
    }

    logger.info(
      {
        cacheKey: key,
        cacheHit: true,
      },
      "Cache hit",
    );

    return JSON.parse(value, (property, parsedValue) => {
      if (
        (property === "createdAt" || property === "updatedAt" || property === "dueDate") &&
        typeof parsedValue === "string"
      ) {
        return new Date(parsedValue);
      }

      return parsedValue;
    }) as T;
  } catch (error) {
    logger.warn(
      {
        error,
        cacheKey: key,
        cacheHit: false,
      },
      "Cache read failed; using database",
    );

    return undefined;
  }
}

export async function setCachedValue(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  if (
    !cache.isReady ||
    await isUserCacheBlocked(userId)
  ) {
    return;
  }

  try {
    await cache.set(
      key,
      JSON.stringify(value),
      {
        EX: env.CACHE_TTL_SECONDS,
      },
    );
  } catch (error) {
    logger.warn(
      {
        error,
        cacheKey: key,
      },
      "Cache write failed",
    );
  }
}

export async function invalidateTodoCache(
  userId: string,
): Promise<void> {
  try {
    if (!cache.isReady) {
      await blockUserCache(userId);

      logger.warn(
        { userId },
        "Cache unavailable during invalidation",
      );

      return;
    }

    await cache.incr(
      getVersionKey(userId),
    );

    await unblockUserCache(userId);

    logger.info(
      { userId },
      "TODO cache version incremented",
    );
  } catch (error) {
    await blockUserCache(userId);

    logger.warn(
      {
        error,
        userId,
      },
      "Cache invalidation failed",
    );
  }
}

export function createListQueryIdentifier(
  query: ListTodoQuery,
): string {
  const state =
    query.state ?? "all";

  return [
    `page=${query.page}`,
    `pageSize=${query.pageSize}`,
    `state=${state}`,
    `sortBy=${query.sortBy}`,
    `sortOrder=${query.sortOrder}`,
  ].join("&");
}