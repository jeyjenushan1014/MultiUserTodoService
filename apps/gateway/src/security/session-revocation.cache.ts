import { createHmac } from "node:crypto";

import {
  redis,
} from "../config/redis.js";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import type {
  AccessTokenClaims,
} from "./access-token-claims.js";

function sessionRevokedKey(
  sessionId: string,
): string {
  const hashedSessionId = createHmac("sha256", env.INTERNAL_SERVICE_SECRET).update(sessionId).digest("hex");
  return `session-revoked:${hashedSessionId}`;
}

function accountRevokedKey(
  userId: string,
): string {
  const hashedUserId = createHmac("sha256", env.INTERNAL_SERVICE_SECRET).update(userId).digest("hex");
  return `account-revoked:${hashedUserId}`;
}

export async function purgeLegacyAccountRevocation(userId: string): Promise<void> {
  await redis.del(`account-revoked:${userId}`);
}

export async function purgeSessionRevocationCaches(sessionIds: readonly string[]): Promise<void> {
  const keys = sessionIds.flatMap((sessionId) => [
    sessionRevokedKey(sessionId),
    `session-revoked:${sessionId}`,
  ]);
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

export async function hasAccountRevocationCache(userId: string): Promise<boolean> {
  const hashedUserId = createHmac("sha256", env.INTERNAL_SERVICE_SECRET).update(userId).digest("hex");
  const values = await redis.mGet([`account-revoked:${hashedUserId}`, `account-revoked:${userId}`]);
  return values.some((value) => value !== null);
}

/*
Called by the gateway's own session-revocation consumer, never by a
request handler, so it never adds latency to an authenticated request.
*/
export async function cacheSessionRevoked(
  sessionId: string,
  revokedAtEpochSeconds: number,
): Promise<void> {
  await redis.set(
    sessionRevokedKey(sessionId),
    String(revokedAtEpochSeconds),
    {
      expiration: {
        type: "EX",
        value:
          env.SESSION_REVOCATION_CACHE_TTL_SECONDS,
      },
    },
  );
}

export async function cacheAccountRevoked(
  userId: string,
  revokedAtEpochSeconds: number,
): Promise<void> {
  await redis.set(
    accountRevokedKey(userId),
    String(revokedAtEpochSeconds),
    {
      expiration: {
        type: "EX",
        value:
          env.SESSION_REVOCATION_CACHE_TTL_SECONDS,
      },
    },
  );
}

/*
Local read used on every authenticated request instead of a
synchronous call to Account Service. When Redis is unreachable this
fails open, the same tradeoff already made for rate limiting: a
missed revocation check is bounded by SESSION_REVOCATION_CACHE_TTL_SECONDS
and the access token's own expiry, whichever is shorter.
*/
export async function isSessionRevoked(
  claims: AccessTokenClaims,
): Promise<boolean> {
  if (!redis.isReady) {
    return false;
  }

  try {
    const revokedSession =
      await redis.get(
        sessionRevokedKey(claims.sessionId),
      ) ?? await redis.get(`session-revoked:${claims.sessionId}`);

    if (revokedSession !== null) {
      return true;
    }

    const revokedAccount =
      await redis.get(
        accountRevokedKey(claims.userId),
      );

    if (revokedAccount === null) {
      return false;
    }

    const revokedAtEpochSeconds =
      Number.parseInt(
        revokedAccount,
        10,
      );

    return (
      Number.isFinite(
        revokedAtEpochSeconds,
      ) &&
      claims.issuedAt <=
        revokedAtEpochSeconds
    );
  } catch (error) {
    logger.warn(
      {
        error,
        dependency: "redis",
      },
      "Session-revocation cache lookup failed; failing open",
    );

    return false;
  }
}
