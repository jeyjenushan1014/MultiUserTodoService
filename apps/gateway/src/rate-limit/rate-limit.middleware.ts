import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

import {
  AppError,
} from "@todo/common";

import {
  createRateLimitKey,
} from "./rate-limit-key.js";

import type {
  RateLimitService,
} from "./rate-limit.service.js";

import type {
  RateLimitPolicy,
} from "./rate-limit.types.js";

export type RateLimitIdentifierResolver =
  (
    request:
      Request,
    response:
      Response,
  ) => string;

function resolveClientIp(
  request:
    Request,
): string {
  return (
    request.ip ??
    request.socket
      .remoteAddress ??
    "unknown"
  );
}

export interface CreateRateLimitMiddlewareOptions {
  readonly service:
    RateLimitService;

  readonly policy:
    RateLimitPolicy;

  readonly resolveIdentifier?:
    RateLimitIdentifierResolver;
}

function handleUnavailable(
  policy:
    RateLimitPolicy,
  next:
    NextFunction,
): void {
  if (
    policy.failClosed ===
    true
  ) {
    next(
      new AppError(
        503,
        "RATE_LIMIT_UNAVAILABLE",
        "Request protection is temporarily unavailable",
      ),
    );

    return;
  }

  next();
}

export function createRateLimitMiddleware(
  options:
    CreateRateLimitMiddlewareOptions,
): RequestHandler {
  return async (
    request:
      Request,
    response:
      Response,
    next:
      NextFunction,
  ): Promise<void> => {
    try {
      const identifier =
        options.resolveIdentifier?.(
          request,
          response,
        ) ??
        resolveClientIp(
          request,
        );

      const key =
        createRateLimitKey(
          options.policy.scope,
          identifier,
        );

      const decision =
        await options.service
          .consume(
            key,
            options.policy,
          );

      /*
       * Redis unavailable: fail open without adding
       * misleading rate-limit headers.
       */
      if (
        decision === undefined
      ) {
        handleUnavailable(
          options.policy,
          next,
        );
        return;
      }

      response.setHeader(
        "RateLimit-Limit",
        String(
          decision.limit,
        ),
      );

      response.setHeader(
        "RateLimit-Remaining",
        String(
          decision.remaining,
        ),
      );

      response.setHeader(
        "RateLimit-Reset",
        String(
          decision.resetAfterSeconds,
        ),
      );

      if (!decision.allowed) {
        response.setHeader(
          "Retry-After",
          String(
            decision
              .resetAfterSeconds,
          ),
        );

        next(
          new AppError(
            429,
            "RATE_LIMIT_EXCEEDED",
            "Too many requests; try again later",
          ),
        );

        return;
      }

      next();
    } catch {
      /*
       * Redis failures are surfaced according to the
       * policy while preserving the existing 503 error.
       */
      handleUnavailable(
        options.policy,
        next,
      );
    }
  };
}