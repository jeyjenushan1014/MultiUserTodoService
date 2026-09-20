import type {
  RequestHandler,
} from "express";

import {
  AppError,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  redis,
} from "../config/redis.js";

const rateLimitScript = `
local current = redis.call(
  "INCR",
  KEYS[1]
)

if current == 1 then
  redis.call(
    "EXPIRE",
    KEYS[1],
    ARGV[1]
  )
end

local ttl = redis.call(
  "TTL",
  KEYS[1]
)

return {
  current,
  ttl
}
`;

interface RateLimitResult {
  readonly count: number;
  readonly retryAfterSeconds: number;
}

async function incrementRateLimit(
  key: string,
): Promise<RateLimitResult> {
  const result = await redis.eval(
    rateLimitScript,
    {
      keys: [
        key,
      ],
      arguments: [
        String(
          env.RATE_LIMIT_WINDOW_SECONDS,
        ),
      ],
    },
  );

  if (
    !Array.isArray(result) ||
    result.length !== 2
  ) {
    throw new Error(
      "Redis returned an invalid rate-limit result",
    );
  }

  return {
    count: Number(result[0]),

    retryAfterSeconds:
      Math.max(
        1,
        Number(result[1]),
      ),
  };
}

export const rateLimitMiddleware:
RequestHandler = async (
  request,
  response,
  next,
): Promise<void> => {

  const callerIdentifier =
    request.ip ?? "unknown";

  if (!redis.isReady) {

    logger.warn(
      {
        callerIdentifier,
      },
      "Rate limiting bypassed because Redis is unavailable",
    );

    response.setHeader(
      "X-RateLimit-Status",
      "degraded",
    );

    next();
    return;
  }

  try {
    const key =
      `gateway:rate-limit:${callerIdentifier}`;

    const result =
      await incrementRateLimit(key);

    response.setHeader(
      "X-RateLimit-Limit",
      String(
        env.RATE_LIMIT_MAX_REQUESTS,
      ),
    );

    response.setHeader(
      "X-RateLimit-Remaining",
      String(
        Math.max(
          0,
          env.RATE_LIMIT_MAX_REQUESTS -
            result.count,
        ),
      ),
    );

    response.setHeader(
      "X-RateLimit-Reset",
      String(
        result.retryAfterSeconds,
      ),
    );

    if (
      result.count >
      env.RATE_LIMIT_MAX_REQUESTS
    ) {
      next(
        new AppError(
          429,
          "RATE_LIMIT_EXCEEDED",
          "Request limit exceeded",
          {
            retryAfterSeconds:
              result.retryAfterSeconds,
          },
        ),
      );

      return;
    }

    next();
  } catch (error) {

    logger.warn(
      {
        error,
        callerIdentifier,
      },
      "Rate limiting failed; request continues in degraded mode",
    );

    response.setHeader(
      "X-RateLimit-Status",
      "degraded",
    );

    next();
  }
};