import type {
  Request,
} from "express";

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

/*
 * The body has already passed through express.json() by the time this
 * middleware runs, so the raw (not yet schema-validated) email is
 * available. A missing or malformed email falls back to the caller's IP
 * so unparsable requests still get *some* limiting rather than none.
 */
function resolveNormalizedEmail(
  request:
    Request,
): string {
  const body =
    request.body as
      Record<string, unknown> | undefined;

  const email =
    body?.email;

  if (typeof email === "string" && email.trim().length > 0) {
    return email
      .trim()
      .toLowerCase();
  }

  return (
    request.ip ??
    request.socket
      .remoteAddress ??
    "unknown"
  );
}

const passwordResetRateLimitByIp =
  createRateLimitMiddleware({
    service:
      rateLimitService,

    policy: {
      scope:
        "password-reset-ip",

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

/*
 * Keyed on the normalised email so a distributed attacker spreading
 * requests across many IPs cannot bypass the per-address limit.
 */
const passwordResetRateLimitByEmail =
  createRateLimitMiddleware({
    service:
      rateLimitService,

    policy: {
      scope:
        "password-reset-email",

      maximumRequests:
        env
          .PASSWORD_RESET_RATE_LIMIT_MAX,

      windowSeconds:
        env
          .PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS,

      failClosed:
        true,
    },

    resolveIdentifier:
      resolveNormalizedEmail,
  });

export const passwordResetRateLimit = [
  passwordResetRateLimitByIp,
  passwordResetRateLimitByEmail,
];