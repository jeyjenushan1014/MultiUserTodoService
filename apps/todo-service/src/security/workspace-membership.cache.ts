import { cache } from "../config/cache.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

function membershipKey(userId: string, workspaceId: string): string {
  return `workspace.membership:${userId}:${workspaceId}`;
}

function membershipRevokedKey(userId: string, workspaceId: string): string {
  return `workspace.revoked:${userId}:${workspaceId}`;
}

export async function cacheMembership(userId: string, workspaceId: string, role: string): Promise<void> {
  await cache.set(membershipKey(userId, workspaceId), role, {
    EX: env.WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS,
  });

  await cache.del(membershipRevokedKey(userId, workspaceId));
}

export async function removeMembership(userId: string, workspaceId: string, revokedAtEpochSeconds: number): Promise<void> {
  await cache.del(membershipKey(userId, workspaceId));

  await cache.set(membershipRevokedKey(userId, workspaceId), String(revokedAtEpochSeconds), {
    EX: env.WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS,
  });
}

export async function getMembershipRole(userId: string, workspaceId: string): Promise<string | null> {
  if (!cache.isReady) return null;

  try {
    return await cache.get(membershipKey(userId, workspaceId));
  } catch (error) {
    logger.warn({ error, dependency: "redis" }, "Todo workspace membership cache lookup failed; failing open");
    return null;
  }
}

export async function getRevokedBefore(userId: string, workspaceId: string): Promise<number | null> {
  if (!cache.isReady) return null;

  try {
    const v = await cache.get(membershipRevokedKey(userId, workspaceId));
    if (v === null) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch (error) {
    logger.warn({ error, dependency: "redis" }, "Todo workspace membership revoked-before lookup failed; failing open");
    return null;
  }
}
