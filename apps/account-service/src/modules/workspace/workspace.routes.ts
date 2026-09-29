import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  requireInternalIdentityMiddleware,
} from "../../security/internal-identity.js";

import {
  validateBody,
} from "../../middleware/validate-body.middleware.js";

import {
  validateParams,
} from "../../middleware/validate-params.middleware.js";

import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  createWorkspace,
  getWorkspace,
  listWorkspaceMembers,
  removeWorkspaceMember,
} from "./workspace.controller.js";

import {
  addWorkspaceMemberSchema,
  changeWorkspaceMemberRoleSchema,
  createWorkspaceSchema,
  workspaceIdParamsSchema,
  workspaceMemberParamsSchema,
} from "./workspace.validation.js";

export const internalWorkspaceRouter =
  Router();

internalWorkspaceRouter.post(
  "/",
  requireInternalIdentityMiddleware,
  validateBody(createWorkspaceSchema),
  asyncHandler(createWorkspace),
);

internalWorkspaceRouter.get(
  "/:workspaceId",
  requireInternalIdentityMiddleware,
  validateParams(workspaceIdParamsSchema),
  asyncHandler(getWorkspace),
);

internalWorkspaceRouter.get(
  "/:workspaceId/members",
  requireInternalIdentityMiddleware,
  validateParams(workspaceIdParamsSchema),
  asyncHandler(listWorkspaceMembers),
);

internalWorkspaceRouter.post(
  "/:workspaceId/members",
  requireInternalIdentityMiddleware,
  validateParams(workspaceIdParamsSchema),
  validateBody(addWorkspaceMemberSchema),
  asyncHandler(addWorkspaceMember),
);

internalWorkspaceRouter.patch(
  "/:workspaceId/members/:userId",
  requireInternalIdentityMiddleware,
  validateParams(workspaceMemberParamsSchema),
  validateBody(changeWorkspaceMemberRoleSchema),
  asyncHandler(changeWorkspaceMemberRole),
);

internalWorkspaceRouter.delete(
  "/:workspaceId/members/:userId",
  requireInternalIdentityMiddleware,
  validateParams(workspaceMemberParamsSchema),
  asyncHandler(removeWorkspaceMember),
);
