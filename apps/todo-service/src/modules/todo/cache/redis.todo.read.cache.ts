import type {
  TodoResponse,
} from "@todo/contracts";

import {
  cache,
} from "../../../config/cache.js";

import {
  env,
} from "../../../config/env.js";

import {
  logger,
} from "../../../config/logger.js";

import type {
  ListTodosParameters,
  ListTodosRepositoryResult,
} from "../list/list-todos.types.js";

import {
  cachedListResultSchema,
  cachedTodoSchema,
} from "./todo.cache.schema.js";

import {
  createTodoItemCacheKey,
  createTodoListCacheKey,
  createTodoVersionKey,
} from "./todo.cache.keys.js";

import {
  getDurableTodoCacheVersion,
} from "./postgres.todo.cache.version.js";

import type {
  TodoItemCacheLookup,
  TodoListCacheLookup,
  TodoReadCache,
} from "./todo.read.cache.interface.js";

type CacheResource =
  | "todo-item"
  | "todo-list";

function createListQueryIdentifier(
  parameters:
    ListTodosParameters,
): string {
  return [
    `page=${parameters.page}`,
    `pageSize=${parameters.pageSize}`,
    `state=${
      parameters.state ??
      "all"
    }`,
    `sortBy=${parameters.sortBy}`,
    `sortOrder=${parameters.sortOrder}`,
  ].join("&");
}

function parseJson(
  serializedValue: string,
): unknown {
  try {
    return JSON.parse(
      serializedValue,
    ) as unknown;
  } catch {
    return undefined;
  }
}

/*
 * PostgreSQL is the authoritative cache-version
 * owner.
 *
 * Redis stores only a synchronized copy of the
 * version for operational visibility.
 */
async function getCacheVersion(
  ownerId: string,
): Promise<
  string | undefined
> {
  /*
   * When Redis is unavailable, there is no reason
   * to query the PostgreSQL cache version because
   * no cached value can be read.
   */
  if (!cache.isReady) {
    return undefined;
  }

  let durableVersion:
    string | undefined;

  try {
    durableVersion =
      await getDurableTodoCacheVersion(
        ownerId,
      );
  } catch (error) {
    /*
     * If the durable PostgreSQL version cannot be
     * verified, cached data must not be trusted.
     */
    logger.warn(
      {
        error,
        ownerId,
        cacheOperation:
          "read-durable-version",
        cacheAvailable:
          cache.isReady,
      },
      "Durable TODO cache version read failed; bypassing cache",
    );

    return undefined;
  }

  if (
    durableVersion ===
    undefined
  ) {
    logger.warn(
      {
        ownerId,
        cacheOperation:
          "read-durable-version",
        cacheAvailable:
          cache.isReady,
      },
      "TODO owner cache version was not found; bypassing cache",
    );

    return undefined;
  }

  try {
    const versionKey =
      createTodoVersionKey(
        ownerId,
      );

    const redisVersion =
      await cache.get(
        versionKey,
      );

    if (
      redisVersion !==
      durableVersion
    ) {
      /*
       * Redis may contain:
       *
       * 1. No version after a Redis restart.
       * 2. An old version after an outage.
       * 3. A value from an earlier deployment.
       *
       * PostgreSQL always wins.
       */
      await cache.set(
        versionKey,
        durableVersion,
      );

      logger.info(
        {
          ownerId,
          cacheOperation:
            "reconcile-version",
          cacheAvailable:
            true,
          durableVersion,
          previousRedisVersion:
            redisVersion,
        },
        "Redis TODO cache version reconciled with PostgreSQL",
      );
    }

    /*
     * Never return redisVersion here.
     *
     * Cache keys must always use the durable
     * PostgreSQL version.
     */
    return durableVersion;
  } catch (error) {
    logger.warn(
      {
        error,
        ownerId,
        durableVersion,
        cacheOperation:
          "reconcile-version",
        cacheAvailable:
          false,
      },
      "Redis TODO cache version reconciliation failed; bypassing cache",
    );

    return undefined;
  }
}

async function readCacheValue(
  cacheKey: string,
  resourceType:
    CacheResource,
): Promise<
  string | null | undefined
> {
  if (!cache.isReady) {
    return undefined;
  }

  try {
    const value =
      await cache.get(
        cacheKey,
      );

    logger.info(
      {
        cacheOperation:
          "read",

        cacheResource:
          resourceType,

        cacheHit:
          value !== null,

        cacheAvailable:
          true,
      },
      value === null
        ? "TODO cache miss"
        : "TODO cache hit",
    );

    return value;
  } catch (error) {
    logger.warn(
      {
        error,

        cacheOperation:
          "read",

        cacheResource:
          resourceType,

        cacheHit:
          false,

        cacheAvailable:
          false,
      },
      "TODO cache read failed; using PostgreSQL",
    );

    return undefined;
  }
}

async function deleteInvalidValue(
  cacheKey: string,
): Promise<void> {
  if (!cache.isReady) {
    return;
  }

  try {
    await cache.del(
      cacheKey,
    );
  } catch (error) {
    logger.warn(
      {
        error,
        cacheOperation:
          "delete-invalid-value",
      },
      "Invalid TODO cache value could not be removed",
    );
  }
}

async function writeCacheValue(
  cacheKey: string,
  value: unknown,
  resourceType:
    CacheResource,
): Promise<void> {
  if (!cache.isReady) {
    return;
  }

  try {
    await cache.set(
      cacheKey,
      JSON.stringify(
        value,
      ),
      {
        EX:
          env.CACHE_TTL_SECONDS,
      },
    );

    logger.info(
      {
        cacheOperation:
          "write",

        cacheResource:
          resourceType,

        cacheAvailable:
          true,

        cacheTtlSeconds:
          env.CACHE_TTL_SECONDS,
      },
      "TODO cache value stored",
    );
  } catch (error) {
    logger.warn(
      {
        error,

        cacheOperation:
          "write",

        cacheResource:
          resourceType,

        cacheAvailable:
          false,
      },
      "TODO cache write failed; request remains successful",
    );
  }
}

export class RedisTodoReadCache
implements TodoReadCache {
  public async lookupItem(
    ownerId: string,
    todoId: string,
  ): Promise<
    TodoItemCacheLookup | undefined
  > {
    /*
     * This returns the PostgreSQL version.
     * It never trusts Redis as the authoritative
     * version source.
     */
    const version =
      await getCacheVersion(
        ownerId,
      );

    if (
      version ===
      undefined
    ) {
      /*
       * Returning undefined instructs the cache
       * decorator to bypass Redis completely and use
       * PostgreSQL.
       */
      return undefined;
    }

    const cacheKey =
      createTodoItemCacheKey(
        ownerId,
        version,
        todoId,
      );

    const serializedValue =
      await readCacheValue(
        cacheKey,
        "todo-item",
      );

    if (
      serializedValue ===
      undefined
    ) {
      /*
       * Redis command failure or Redis became
       * unavailable after version resolution.
       */
      return undefined;
    }

    if (
      serializedValue ===
      null
    ) {
      /*
       * Redis is available, but this key does not
       * exist. The decorator can query PostgreSQL
       * and store the result using this exact key.
       */
      return {
        cacheKey,
      };
    }

    const parsed =
      cachedTodoSchema.safeParse(
        parseJson(
          serializedValue,
        ),
      );

    if (!parsed.success) {
      logger.warn(
        {
          cacheOperation:
            "validate",

          cacheResource:
            "todo-item",

          cacheHit:
            false,
        },
        "Invalid TODO item cache value; using PostgreSQL",
      );

      await deleteInvalidValue(
        cacheKey,
      );

      return {
        cacheKey,
      };
    }

    /*
     * Defence in depth:
     *
     * Even though the key contains the owner and
     * TODO ID, the cached payload must contain the
     * same values.
     */
    if (
      parsed.data.ownerId !==
        ownerId ||
      parsed.data.id !==
        todoId
    ) {
      logger.warn(
        {
          cacheOperation:
            "validate-ownership",

          cacheResource:
            "todo-item",

          cacheHit:
            false,
        },
        "TODO cache ownership mismatch; using PostgreSQL",
      );

      await deleteInvalidValue(
        cacheKey,
      );

      return {
        cacheKey,
      };
    }

    return {
      cacheKey,

      value:
        parsed.data,
    };
  }

  public async storeItem(
    cacheKey: string,
    todo: TodoResponse,
  ): Promise<void> {
    await writeCacheValue(
      cacheKey,
      todo,
      "todo-item",
    );
  }

  public async lookupList(
    parameters:
      ListTodosParameters,
  ): Promise<
    TodoListCacheLookup | undefined
  > {
    /*
     * The owner version comes from PostgreSQL.
     */
    const version =
      await getCacheVersion(
        parameters.ownerId,
      );

    if (
      version ===
      undefined
    ) {
      return undefined;
    }

    const queryIdentifier =
      createListQueryIdentifier(
        parameters,
      );

    const cacheKey =
      createTodoListCacheKey(
        parameters.ownerId,
        version,
        queryIdentifier,
      );

    const serializedValue =
      await readCacheValue(
        cacheKey,
        "todo-list",
      );

    if (
      serializedValue ===
      undefined
    ) {
      return undefined;
    }

    if (
      serializedValue ===
      null
    ) {
      return {
        cacheKey,
      };
    }

    const parsed =
      cachedListResultSchema
        .safeParse(
          parseJson(
            serializedValue,
          ),
        );

    if (!parsed.success) {
      logger.warn(
        {
          cacheOperation:
            "validate",

          cacheResource:
            "todo-list",

          cacheHit:
            false,
        },
        "Invalid TODO list cache value; using PostgreSQL",
      );

      await deleteInvalidValue(
        cacheKey,
      );

      return {
        cacheKey,
      };
    }

    const ownershipIsValid =
      parsed.data.items.every(
        (todo) =>
          todo.ownerId ===
          parameters.ownerId,
      );

    if (!ownershipIsValid) {
      logger.warn(
        {
          cacheOperation:
            "validate-ownership",

          cacheResource:
            "todo-list",

          cacheHit:
            false,
        },
        "TODO list cache ownership mismatch; using PostgreSQL",
      );

      await deleteInvalidValue(
        cacheKey,
      );

      return {
        cacheKey,
      };
    }

    return {
      cacheKey,

      value: {
        items:
          parsed.data.items,

        totalItems:
          parsed.data.totalItems,
      },
    };
  }

  public async storeList(
    cacheKey: string,
    result:
      ListTodosRepositoryResult,
  ): Promise<void> {
    await writeCacheValue(
      cacheKey,
      result,
      "todo-list",
    );
  }
}