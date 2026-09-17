import { cache } from "../../config/cache.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type {
  ListTodoQuery,
} from "./todo.types.js";


const CACHE_VERSION_PREFIX = "todo:version";
const TODO_CACHE_PREFIX = "todo";

//temporarilyBlockedUsers is a Map that keeps track of users who have been temporarily blocked from using the cache. 
//The key is the userId, and the value is the timestamp (in milliseconds) until which the user is blocked.
//cache todoItem use this format this prevents cannot be used other user items : todo:{userId}:{version}:item:{todoId}
//cache todoList use this format this prevents cannot be used other user items : todo:{userId}:{version}:list:{query}
const temporarilyBlockedUsers =
  new Map<string, number>();

function getVersionKey(userId: string): string {
  return `${CACHE_VERSION_PREFIX}:${userId}`;
}

function blockUserCache(userId: string): void {
  const blockedUntil =
    Date.now() + env.CACHE_TTL_SECONDS * 1000;

  temporarilyBlockedUsers.set(
    userId,
    blockedUntil,
  );
}

//isUserCacheBlocked checks if a user is currently blocked from using the cache.
function isUserCacheBlocked(
  userId: string,
): boolean {
  const blockedUntil =
    temporarilyBlockedUsers.get(userId);

  if (blockedUntil === undefined) {
    return false;
  }

  if (Date.now() >= blockedUntil) {
    temporarilyBlockedUsers.delete(userId);
    return false;
  }

  return true;
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
    isUserCacheBlocked(userId)
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

    return JSON.parse(value) as T;
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
    isUserCacheBlocked(userId)
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
      blockUserCache(userId);

      logger.warn(
        { userId },
        "Cache unavailable during invalidation",
      );

      return;
    }

    await cache.incr(
      getVersionKey(userId),
    );

    logger.info(
      { userId },
      "TODO cache version incremented",
    );
  } catch (error) {
    blockUserCache(userId);

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