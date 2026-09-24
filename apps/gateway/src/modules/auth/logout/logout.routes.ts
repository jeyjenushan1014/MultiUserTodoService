import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  logout,
  logoutAll,
} from "./logout.controller.js";

export const logoutRouter =
  Router();

logoutRouter.post(
  "/logout",
  asyncHandler(logout),
);

logoutRouter.post(
  "/logout-all",
  asyncHandler(logoutAll),
);