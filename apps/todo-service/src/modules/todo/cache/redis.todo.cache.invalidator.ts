import {
  cache,
} from "../../../config/cache.js";

import {
  logger,
} from "../../../config/logger.js";

import {
  createTodoVersionKey,
} from "./todo.cache.keys.js";

import {
  getDurableTodoCacheVersion,
} from "./postgres.todo.cache.version.js";

import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export class RedisTodoCacheInvalidator
implements TodoCacheInvalidator {
  public async invalidateOwner(
    ownerId: string,
  ): Promise<void> {
    /*
     * The PostgreSQL trigger has already incremented
     * the durable version inside the TODO mutation
     * transaction.
     */
    const durableVersion =
      await getDurableTodoCacheVersion(
        ownerId,
      );

    if (
      durableVersion ===
      undefined
    ) {
      logger.warn(
        {
          ownerId,
          cacheOperation:
            "synchronize-version",
        },
        "TODO owner cache version was not found",
      );

      return;
    }

    if (!cache.isReady) {
      /*
       * No data is lost here. PostgreSQL already owns
       * the new durable version.
       */
      logger.warn(
        {
          ownerId,
          durableVersion,
          cacheAvailable:
            false,
          cacheOperation:
            "synchronize-version",
        },
        "Redis unavailable; durable TODO cache version remains in PostgreSQL",
      );

      return;
    }

    try {
      /*
       * SET is used instead of INCR.
       *
       * PostgreSQL is now the authoritative version
       * owner, so Redis must be synchronized to that
       * exact value.
       */
      await cache.set(
        createTodoVersionKey(
          ownerId,
        ),
        durableVersion,
      );

      logger.info(
        {
          ownerId,
          cacheOperation:
            "synchronize-version",
          cacheVersion:
            durableVersion,
        },
        "Redis TODO cache version synchronized with PostgreSQL",
      );
    } catch (error) {
      /*
       * The database mutation and durable version
       * increment have already committed.
       */
      logger.warn(
        {
          error,
          ownerId,
          durableVersion,
          cacheOperation:
            "synchronize-version",
        },
        "Redis TODO cache version synchronization failed",
      );
    }
  }
}