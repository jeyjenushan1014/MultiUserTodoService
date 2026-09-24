import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  getMe,
} from "./profile.controller.js";

export const profileRouter =
  Router();

profileRouter.get(
  "/me",
  asyncHandler(getMe),
);