import {
  cache,
} from "../../../config/cache.js";

import {
  logger,
} from "../../../config/logger.js";

import {
  createTodoVersionKey,
} from "./todo.cache.keys.js";

import type {
  TodoCacheInvalidator,
} from "./todo.cache.invalidator.interface.js";

export class RedisTodoCacheInvalidator
implements TodoCacheInvalidator {
  public async invalidateOwner(
    ownerId: string,
  ): Promise<void> {
    if (!cache.isReady) {
      /*
       * The database mutation has already succeeded.
       * A cache infrastructure failure must not change
       * that successful business result into an API
       * failure.
       *
       * Part 13 adds durable recovery for this case.
       */
      logger.warn(
        {
          ownerId,
          cacheOperation:
            "invalidate",
          cacheAvailable:
            false,
        },
        "TODO cache invalidation skipped because Redis is unavailable",
      );

      return;
    }

    try {
      const newVersion =
        await cache.incr(
          createTodoVersionKey(
            ownerId,
          ),
        );

      logger.info(
        {
          ownerId,
          cacheOperation:
            "invalidate",
          cacheVersion:
            newVersion,
        },
        "TODO cache version incremented",
      );
    } catch (error) {
      /*
       * Do not throw here because the PostgreSQL
       * mutation has already committed.
       */
      logger.warn(
        {
          error,
          ownerId,
          cacheOperation:
            "invalidate",
        },
        "TODO cache invalidation failed after successful database mutation",
      );
    }
  }
}