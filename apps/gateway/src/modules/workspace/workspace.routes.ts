import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  authenticate,
} from "../../middleware/authenticate.middleware.js";

import {
  validateBody,
} from "../../middleware/validate-body.middleware.js";

import {
  validateParams,
} from "../../middleware/validate-params.middleware.js";

import {
  addWorkspaceMemberController,
  changeWorkspaceMemberRoleController,
  createWorkspaceController,
  getWorkspaceController,
  listWorkspaceMembersController,
  removeWorkspaceMemberController,
} from "./workspace.controller.js";

import {
  addWorkspaceMemberSchema,
  changeWorkspaceMemberRoleSchema,
  createWorkspaceSchema,
  workspaceIdParamsSchema,
  workspaceMemberParamsSchema,
} from "./workspace.validation.js";

export const workspaceRouter =
  Router();

workspaceRouter.post(
  "/",
  authenticate,
  validateBody(createWorkspaceSchema),
  asyncHandler(createWorkspaceController),
);

workspaceRouter.get(
  "/:workspaceId",
  authenticate,
  validateParams(workspaceIdParamsSchema),
  asyncHandler(getWorkspaceController),
);

workspaceRouter.get(
  "/:workspaceId/members",
  authenticate,
  validateParams(workspaceIdParamsSchema),
  asyncHandler(listWorkspaceMembersController),
);

workspaceRouter.post(
  "/:workspaceId/members",
  authenticate,
  validateParams(workspaceIdParamsSchema),
  validateBody(addWorkspaceMemberSchema),
  asyncHandler(addWorkspaceMemberController),
);

workspaceRouter.patch(
  "/:workspaceId/members/:userId",
  authenticate,
  validateParams(workspaceMemberParamsSchema),
  validateBody(changeWorkspaceMemberRoleSchema),
  asyncHandler(changeWorkspaceMemberRoleController),
);

workspaceRouter.delete(
  "/:workspaceId/members/:userId",
  authenticate,
  validateParams(workspaceMemberParamsSchema),
  asyncHandler(removeWorkspaceMemberController),
);
