import type { RequestHandler } from "express";

import { AppError } from "@todo/common";
import { canPerform } from "@todo/contracts";
import type { WorkspaceAction, WorkspaceRole } from "@todo/contracts";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { getWorkspaceAuthorization } from "../security/workspace-membership.cache.js";
import { getCallerIdentity } from "./authenticate.middleware.js";

export function authorizeWorkspace(
  action: WorkspaceAction,
  paramName = "workspaceId",
): RequestHandler {
  return async (request, response, next) => {
    try {
      const identity = getCallerIdentity(response);

      const workspaceId =
        (request.params as Record<string, string>)[paramName];

      if (typeof workspaceId !== "string" || workspaceId.length === 0) {
        throw new AppError(
          400,
          "INVALID_WORKSPACE_ID",
          "Workspace id is required",
        );
      }

      const { role, revokedBefore } = await getWorkspaceAuthorization(
        identity.userId,
        workspaceId,
      ) as {
        role: WorkspaceRole | null;
        revokedBefore: number | null;
      };

      if (
        revokedBefore !== null &&
        identity.accessTokenIssuedAt <= revokedBefore
      ) {
        logger.warn(
          {
            userId: identity.userId,
            workspaceId,
            accessTokenIssuedAt: identity.accessTokenIssuedAt,
            revokedBefore,
          },
          "Workspace authorization denied by revoked-before watermark",
        );

        throw new AppError(
          403,
          "WORKSPACE_ACTION_FORBIDDEN",
          "You do not have permission to perform this action",
        );
      }

      if (role === null) {
        if (
          env.WORKSPACE_PROJECTION_FAIL_OPEN &&
          revokedBefore === null
        ) {
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
        throw new AppError(
          403,
          "WORKSPACE_ACTION_FORBIDDEN",
          "You do not have permission to perform this action",
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}