import { redis } from "../config/redis.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

function membershipKey(userId: string, workspaceId: string): string {
  return `workspace.membership:${userId}:${workspaceId}`;
}

function membershipRevokedKey(userId: string, workspaceId: string): string {
  return `workspace.revoked:${userId}:${workspaceId}`;
}

export async function cacheMembership(
  userId: string,
  workspaceId: string,
  role: string,
): Promise<void> {
  await redis.set(membershipKey(userId, workspaceId), role, {
    expiration: { type: "EX", value: env.SESSION_REVOCATION_CACHE_TTL_SECONDS },
  });

  // remove any revoked-before marker if present
  await redis.del(membershipRevokedKey(userId, workspaceId));
}

export async function removeMembership(
  userId: string,
  workspaceId: string,
  revokedAtEpochSeconds: number,
): Promise<void> {
  // delete role key
  await redis.del(membershipKey(userId, workspaceId));

  // write revoked-before timestamp so older tokens/requests can be rejected
  await redis.set(membershipRevokedKey(userId, workspaceId), String(revokedAtEpochSeconds), {
    expiration: { type: "EX", value: env.SESSION_REVOCATION_CACHE_TTL_SECONDS },
  });
}

export async function getMembershipRole(userId: string, workspaceId: string): Promise<string | null> {
  if (!redis.isReady) return null;

  try {
    return await redis.get(membershipKey(userId, workspaceId));
  } catch (error) {
    logger.warn({ error, dependency: "redis" }, "Workspace membership cache lookup failed; failing open");
    return null;
  }
}

export async function getRevokedBefore(userId: string, workspaceId: string): Promise<number | null> {
  if (!redis.isReady) return null;

  try {
    const v = await redis.get(membershipRevokedKey(userId, workspaceId));
    if (v === null) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch (error) {
    logger.warn({ error, dependency: "redis" }, "Workspace membership revoked-before lookup failed; failing open");
    return null;
  }
}
