import type { RequestHandler } from "express";

import { AppError } from "@todo/common";
import { getWorkspaceAuthorization } from "../security/workspace-membership.cache.js";
import { canPerform } from "@todo/contracts";
import { env } from "../config/env.js";

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

      const issuedAt = (response.locals as Record<string, unknown>).accessTokenIssuedAt;
      if (typeof issuedAt !== "number" || !Number.isInteger(issuedAt)) {
        throw new AppError(500, "AUTHENTICATION_CONTEXT_INVALID", "Authentication context is invalid");
      }

      const { role, revokedBefore } = await getWorkspaceAuthorization(caller.userId, workspaceId) as {
        role: WorkspaceRole | null;
        revokedBefore: number | null;
      };
      if (revokedBefore !== null && issuedAt <= revokedBefore) {
        throw new AppError(403, "WORKSPACE_ACTION_FORBIDDEN", "You do not have permission to perform this action");
      }

     if (role === null) {
  if (env.WORKSPACE_PROJECTION_FAIL_OPEN && revokedBefore === null) {
    next();
    return;
  }

  throw new AppError(
    403,
    "WORKSPACE_ACTION_FORBIDDEN",
    "You do not have permission to perform this action",
  );
}

      if (!canPerform(role, action)) {
        throw new AppError(403, "WORKSPACE_ACTION_FORBIDDEN", "You do not have permission to perform this action");
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
