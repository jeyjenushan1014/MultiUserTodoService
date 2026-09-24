import {
  redis,
} from "../config/redis.js";

import {
  logger,
} from "../config/logger.js";

import type {
  RateLimitStore,
} from "./rate-limit.store.interface.js";

import type {
  RateLimitConsumeCommand,
  RateLimitStoreResult,
} from "./rate-limit.types.js";

/*
The Lua script executes atomically inside Redis.

Without this script, these operations could race:

INCR
PEXPIRE
PTTL
*/
const CONSUME_RATE_LIMIT_SCRIPT = `
local currentCount = redis.call("INCR", KEYS[1])

if currentCount == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end

local remainingMilliseconds = redis.call("PTTL", KEYS[1])

if remainingMilliseconds < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  remainingMilliseconds = tonumber(ARGV[1])
end

return {
  currentCount,
  remainingMilliseconds
}
`;

function parseRedisResult(
  value:
    unknown,
): RateLimitStoreResult |
  undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 2
  ) {
    return undefined;
  }

  const currentCount =
    Number(
      value[0],
    );

  const remainingMilliseconds =
    Number(
      value[1],
    );

  if (
    !Number.isFinite(
      currentCount,
    ) ||
    !Number.isFinite(
      remainingMilliseconds,
    ) ||
    currentCount < 1 ||
    remainingMilliseconds < 0
  ) {
    return undefined;
  }

  return {
    currentCount,

    remainingMilliseconds,
  };
}

export class RedisRateLimitStore
implements RateLimitStore {
  public async consume(
    command:
      RateLimitConsumeCommand,
  ): Promise<
    RateLimitStoreResult |
    undefined
  > {
    if (!redis.isReady) {
      return undefined;
    }

    try {
      const result =
        await redis.eval(
          CONSUME_RATE_LIMIT_SCRIPT,
          {
            keys: [
              command.key,
            ],

            arguments: [
              String(
                command
                  .windowMilliseconds,
              ),
            ],
          },
        );

      const parsedResult =
        parseRedisResult(
          result,
        );

      if (
        parsedResult === undefined
      ) {
        logger.warn(
          {
            rateLimitKey:
              command.key,

            dependency:
              "redis",
          },
          "Redis returned an invalid rate-limit result",
        );
      }

      return parsedResult;
    } catch (error) {
      logger.warn(
        {
          error,

          rateLimitKey:
            command.key,

          dependency:
            "redis",
        },
        "Distributed rate-limit operation failed; request allowed",
      );

      return undefined;
    }
  }
}