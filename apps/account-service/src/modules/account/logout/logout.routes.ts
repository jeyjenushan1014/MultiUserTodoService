import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  requireInternalIdentityMiddleware,
} from "../../../security/internal-identity.js";

import {
  logout,
  logoutAll,
} from "./logout.controller.js";

export const internalLogoutRouter =
  Router();

internalLogoutRouter.post(
  "/logout",
  requireInternalIdentityMiddleware,
  asyncHandler(logout),
);

internalLogoutRouter.post(
  "/logout-all",
  requireInternalIdentityMiddleware,
  asyncHandler(logoutAll),
);