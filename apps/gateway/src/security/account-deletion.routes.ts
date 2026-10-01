import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { AppError, asyncHandler } from "@todo/common";
import { z } from "zod";

import { env } from "../config/env.js";
import { cacheAccountRevoked, hasAccountRevocationCache, purgeLegacyAccountRevocation, purgeSessionRevocationCaches } from "./session-revocation.cache.js";
import { hasWorkspaceMembershipCache, purgeWorkspaceMembershipCache } from "./workspace-membership.cache.js";

const membershipBodySchema = z.object({
  userId: z.uuid(),
  workspaceIds: z.array(z.uuid()).max(1000),
  sessionIds: z.array(z.uuid()).max(10_000),
});
const verificationBodySchema = z.object({ userId: z.uuid(), workspaceIds: z.array(z.uuid()).max(1000) });

function authenticateInternalRequest(request: Request, _response: Response, next: NextFunction): void {
  const supplied = request.header("x-internal-service-key") ?? "";
  const expected = env.INTERNAL_SERVICE_SECRET;
  const valid = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) {
    next(new AppError(401, "UNAUTHORIZED_INTERNAL_REQUEST", "Internal request authentication failed"));
    return;
  }
  next();
}

export const accountDeletionCacheRouter = Router();

accountDeletionCacheRouter.delete(
  "/cache",
  authenticateInternalRequest,
  asyncHandler(async (request, response): Promise<void> => {
    const body = membershipBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Account and workspace identifiers are invalid");
    }
    await cacheAccountRevoked(body.data.userId, Math.floor(Date.now() / 1000));
    await purgeLegacyAccountRevocation(body.data.userId);
    await purgeSessionRevocationCaches(body.data.sessionIds);
    await purgeWorkspaceMembershipCache(body.data.userId, body.data.workspaceIds);
    response.status(204).end();
  }),
);

accountDeletionCacheRouter.post(
  "/verify",
  authenticateInternalRequest,
  asyncHandler(async (request, response): Promise<void> => {
    const body = verificationBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Account and workspace identifiers are invalid");
    }
    const accountRevocationCache = await hasAccountRevocationCache(body.data.userId);
    const workspaceMembershipCache = await hasWorkspaceMembershipCache(body.data.userId, body.data.workspaceIds);
    response.status(200).json({
      verified: !accountRevocationCache && !workspaceMembershipCache,
      accountRevocationCache,
      workspaceMembershipCache,
    });
  }),
);