import type { RequestHandler } from "express";

import { AppError } from "@todo/common";
import { getCallerIdentity } from "./authenticate.middleware.js";
import { getMembershipRole, getRevokedBefore } from "../security/workspace-membership.cache.js";
import { canPerform } from "@todo/contracts";

import type { WorkspaceAction, WorkspaceRole } from "@todo/contracts";

export function authorizeWorkspace(action: WorkspaceAction, paramName = "workspaceId"): RequestHandler {
  return async (request, response, next) => {
    try {
      const identity = getCallerIdentity(response);

      const workspaceId = (request.params as Record<string, string>)[paramName];

      if (typeof workspaceId !== "string" || workspaceId.length === 0) {
        throw new AppError(400, "INVALID_WORKSPACE_ID", "Workspace id is required");
      }

      const role = await getMembershipRole(identity.userId, workspaceId) as WorkspaceRole | null;

      // revoked-before check
      const issuedAt = (response.locals as Record<string, unknown>).accessTokenIssuedAt as number | undefined;

      if (issuedAt !== undefined) {
        const revokedBefore = await getRevokedBefore(identity.userId, workspaceId);
        if (revokedBefore !== null && issuedAt <= revokedBefore) {
          throw new AppError(403, "WORKSPACE_ACTION_FORBIDDEN", "You do not have permission to perform this action");
        }
      }

      if (role === null) {
        throw new AppError(403, "WORKSPACE_ACTION_FORBIDDEN", "You do not have permission to perform this action");
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
