import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  authenticate,
  authenticateDeletionRetry,
} from "../../../middleware/authenticate.middleware.js";

import {
  exportAccount,
  getMe,
} from "./profile.controller.js";

import {
  requestAccountDeletion,
} from "./profile.controller.js";

export const profileRouter =
  Router();

profileRouter.get(
  "/me",
  authenticate,
  asyncHandler(getMe),
);

profileRouter.delete(
  "/me",
  authenticateDeletionRetry,
  asyncHandler(requestAccountDeletion),
);

profileRouter.get(
  "/me/export",
  authenticate,
  asyncHandler(exportAccount),
);