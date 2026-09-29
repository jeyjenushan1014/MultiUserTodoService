import type { RequestHandler } from "express";

import { AppError } from "@todo/common";

import { workspaceService } from "../../workspace/workspace.module.js";

export const getAccountWorkspacesController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.params.userId;

    if (typeof userId !== "string" || userId.length === 0) {
      throw new AppError(400, "INVALID_USER_ID", "User id is required");
    }

    const workspaces = await workspaceService.listWorkspacesForAccount(userId);

    res.status(200).json({ workspaces });
  } catch (err) {
    next(err);
  }
};
