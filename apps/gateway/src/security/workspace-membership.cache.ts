import { redis } from "../config/redis.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "@todo/common";

function membershipKey(userId: string, workspaceId: string): string {
  return `workspace.membership:${userId}:${workspaceId}`;
}

function membershipRevokedKey(userId: string, workspaceId: string): string {
  return `workspace.revoked:${userId}:${workspaceId}`;
}

function membershipVersionKey(userId: string, workspaceId: string): string {
  return `workspace.membership-version:${userId}:${workspaceId}`;
}

const applyMembershipEventScript = `
local currentVersion = redis.call('GET', KEYS[3])
local eventVersion = tonumber(ARGV[1])
if currentVersion and eventVersion < tonumber(currentVersion) then
  return 0
end
redis.call('SET', KEYS[3], ARGV[1], 'EX', ARGV[4])
if ARGV[2] == '' then
  redis.call('DEL', KEYS[1])
  redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
else
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
end
return 1
`;

async function applyMembershipEvent(
  userId: string,
  workspaceId: string,
  role: string | null,
  changedAtEpochMilliseconds: number,
): Promise<void> {
  if (!redis.isReady) {
    throw new AppError(503, "WORKSPACE_PROJECTION_UNAVAILABLE", "Workspace authorization is temporarily unavailable");
  }

  const revokedAtEpochSeconds = Math.floor(changedAtEpochMilliseconds / 1000);
  if (!Number.isSafeInteger(changedAtEpochMilliseconds) || changedAtEpochMilliseconds < 0) {
    throw new AppError(503, "WORKSPACE_PROJECTION_INVALID", "Workspace authorization data is invalid");
  }

  await redis.eval(applyMembershipEventScript, {
    keys: [
      membershipKey(userId, workspaceId),
      membershipRevokedKey(userId, workspaceId),
      membershipVersionKey(userId, workspaceId),
    ],
    arguments: [
      String(changedAtEpochMilliseconds),
      role ?? "",
      String(revokedAtEpochSeconds),
      String(env.WORKSPACE_MEMBERSHIP_CACHE_TTL_SECONDS),
    ],
  });
}

export async function cacheMembership(
  userId: string,
  workspaceId: string,
  role: string,
  changedAtEpochMilliseconds: number,
): Promise<void> {
  await applyMembershipEvent(userId, workspaceId, role, changedAtEpochMilliseconds);
}

export async function removeMembership(
  userId: string,
  workspaceId: string,
  revokedAtEpochSeconds: number,
  changedAtEpochMilliseconds: number,
): Promise<void> {
  if (!Number.isSafeInteger(revokedAtEpochSeconds) || revokedAtEpochSeconds < 0) {
    throw new AppError(503, "WORKSPACE_PROJECTION_INVALID", "Workspace authorization data is invalid");
  }

  if (!Number.isSafeInteger(changedAtEpochMilliseconds) || changedAtEpochMilliseconds < 0) {
    throw new AppError(503, "WORKSPACE_PROJECTION_INVALID", "Workspace authorization data is invalid");
  }

  await applyMembershipEvent(userId, workspaceId, null, changedAtEpochMilliseconds);
}

export interface WorkspaceAuthorizationProjection {
  readonly role: string | null;
  readonly revokedBefore: number | null;
}

export async function getWorkspaceAuthorization(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAuthorizationProjection> {
  if (!redis.isReady) {
    throw new AppError(503, "WORKSPACE_PROJECTION_UNAVAILABLE", "Workspace authorization is temporarily unavailable");
  }

  try {
    const [roleValue, revokedValue] = await redis.mGet([
      membershipKey(userId, workspaceId),
      membershipRevokedKey(userId, workspaceId),
    ]);
    const role = roleValue ?? null;
    if (revokedValue === null || revokedValue === undefined) {
      return { role, revokedBefore: null };
    }
    const revokedBefore = Number.parseInt(revokedValue, 10);
    if (!Number.isSafeInteger(revokedBefore) || revokedBefore < 0) {
      throw new Error("Invalid workspace revoked-before cache value");
    }
    return { role, revokedBefore };
  } catch (error) {
    logger.warn({ error, dependency: "redis" }, "Workspace authorization projection lookup failed");
    throw new AppError(503, "WORKSPACE_PROJECTION_UNAVAILABLE", "Workspace authorization is temporarily unavailable");
  }
}

export async function getMembershipRole(userId: string, workspaceId: string): Promise<string | null> {
  if (!redis.isReady) {
    throw new AppError(503, "WORKSPACE_PROJECTION_UNAVAILABLE", "Workspace authorization is temporarily unavailable");
  }

  try {
    return await redis.get(membershipKey(userId, workspaceId));
  } catch (error) {
    logger.warn({ error, dependency: "redis" }, "Workspace membership cache lookup failed; failing open");
    throw new AppError(503, "WORKSPACE_PROJECTION_UNAVAILABLE", "Workspace authorization is temporarily unavailable");
  }
}

export async function getRevokedBefore(userId: string, workspaceId: string): Promise<number | null> {
  if (!redis.isReady) {
    throw new AppError(503, "WORKSPACE_PROJECTION_UNAVAILABLE", "Workspace authorization is temporarily unavailable");
  }

  try {
    const v = await redis.get(membershipRevokedKey(userId, workspaceId));
    if (v === null) return null;
    const n = Number.parseInt(v, 10);
    if (!Number.isSafeInteger(n) || n < 0) {
      throw new Error("Invalid workspace revoked-before cache value");
    }
    return n;
  } catch (error) {
    logger.warn({ error, dependency: "redis" }, "Workspace membership revoked-before lookup failed");
    throw new AppError(503, "WORKSPACE_PROJECTION_UNAVAILABLE", "Workspace authorization is temporarily unavailable");
  }
}
