import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  requireInternalService,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  logout,
  logoutAll,
} from "./logout.controller.js";

export const internalLogoutRouter =
  Router();

internalLogoutRouter.post(
  "/logout",
  requireInternalService,
  asyncHandler(logout),
);

internalLogoutRouter.post(
  "/logout-all",
  requireInternalService,
  asyncHandler(logoutAll),
);