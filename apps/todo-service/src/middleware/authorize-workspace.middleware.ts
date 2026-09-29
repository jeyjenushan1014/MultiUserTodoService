import type { RequestHandler } from "express";

import { AppError } from "@todo/common";
import { getMembershipRole, getRevokedBefore } from "../security/workspace-membership.cache.js";
import { canPerform } from "@todo/contracts";

import type { WorkspaceAction, WorkspaceRole } from "@todo/contracts";

export function authorizeWorkspace(action: WorkspaceAction, paramName = "workspaceId"): RequestHandler {
  return async (request, response, next) => {
    try {
      const caller = (response.locals as Record<string, unknown>).callerIdentity as { userId?: string } | undefined;

      if (caller === undefined || typeof caller.userId !== "string") {
        throw new AppError(500, "AUTHENTICATION_CONTEXT_MISSING", "Authentication context is unavailable");
      }

      const workspaceId = (request.params as Record<string, string>)[paramName];

      if (typeof workspaceId !== "string" || workspaceId.length === 0) {
        throw new AppError(400, "INVALID_WORKSPACE_ID", "Workspace id is required");
      }

      const role = await getMembershipRole(caller.userId, workspaceId) as WorkspaceRole | null;

      const issuedAt = (response.locals as Record<string, unknown>).accessTokenIssuedAt as number | undefined;
      if (issuedAt !== undefined) {
        const revokedBefore = await getRevokedBefore(caller.userId, workspaceId);
        if (revokedBefore !== null && issuedAt <= revokedBefore) {
          throw new AppError(403, "WORKSPACE_ACTION_FORBIDDEN", "You do not have permission to perform this action");
        }
      }

      if (role === null || !canPerform(role, action)) {
        throw new AppError(403, "WORKSPACE_ACTION_FORBIDDEN", "You do not have permission to perform this action");
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
