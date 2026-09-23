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

import type {
  TodoItemCacheLookup,
  TodoListCacheLookup,
  TodoReadCache,
} from "./todo.read.cache.interface.js";


function createListQueryIdentifier(
  parameters:
    ListTodosParameters,
): string {
  return [
    `page=${parameters.page}`,
    `pageSize=${parameters.pageSize}`,
    `state=${parameters.state ?? "all"}`,
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


async function getCacheVersion(
  ownerId: string,
): Promise<string | undefined> {
  if (!cache.isReady) {
    return undefined;
  }

  try {
    const version =
      await cache.get(
        createTodoVersionKey(
          ownerId,
        ),
      );

    if (version === null) {
      return "0";
    }

    if (!/^\d+$/.test(version)) {
      logger.warn(
        {
          cacheOperation:
            "read-version",
          cacheAvailable:
            true,
          ownerId,
        },
        "Invalid TODO cache version; bypassing cache",
      );

      return undefined;
    }

    return version;
  } catch (error) {
    logger.warn(
      {
        error,
        cacheOperation:
          "read-version",
        cacheAvailable:
          false,
        ownerId,
      },
      "TODO cache version read failed",
    );

    return undefined;
  }
}


async function readCacheValue(
  cacheKey: string,
  resourceType:
    "todo-item" | "todo-list",
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
    "todo-item" | "todo-list",
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
    const version =
      await getCacheVersion(
        ownerId,
      );

    if (version === undefined) {
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
     * Defence in depth against a cache entry
     * stored under an incorrect owner or
     * item key.
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
    const version =
      await getCacheVersion(
        parameters.ownerId,
      );

    if (version === undefined) {
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