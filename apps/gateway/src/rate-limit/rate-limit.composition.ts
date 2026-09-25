import {
  env,
} from "../config/env.js";

import {
  createRateLimitMiddleware,
} from "./rate-limit.middleware.js";

import {
  RateLimitService,
} from "./rate-limit.service.js";

import {
  RedisRateLimitStore,
} from "./redis.rate-limit.store.js";

const rateLimitStore =
  new RedisRateLimitStore();

const rateLimitService =
  new RateLimitService(
    rateLimitStore,
  );

export const generalApiRateLimit =
  createRateLimitMiddleware({
    service:
      rateLimitService,

    policy: {
      scope:
        "general-api",

      maximumRequests:
        env
          .GENERAL_RATE_LIMIT_MAX,

      windowSeconds:
        env
          .GENERAL_RATE_LIMIT_WINDOW_SECONDS,
    },
  });

export const authenticationRateLimit =
  createRateLimitMiddleware({
    service:
      rateLimitService,

    policy: {
      scope:
        "authentication",

      maximumRequests:
        env
          .AUTH_RATE_LIMIT_MAX,

      windowSeconds:
        env
          .AUTH_RATE_LIMIT_WINDOW_SECONDS,

      failClosed:
        true,
    },
  });

export const passwordResetRateLimit =
  createRateLimitMiddleware({
    service:
      rateLimitService,

    policy: {
      scope:
        "password-reset",

      maximumRequests:
        env
          .PASSWORD_RESET_RATE_LIMIT_MAX,

      windowSeconds:
        env
          .PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS,

      failClosed:
        true,
    },
  });