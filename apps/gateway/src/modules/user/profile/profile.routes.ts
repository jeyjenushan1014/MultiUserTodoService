import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  authenticate,
} from "../../../middleware/authenticate.middleware.js";

import {
  getMe,
} from "./profile.controller.js";

export const profileRouter =
  Router();

profileRouter.get(
  "/me",
  authenticate,
  asyncHandler(getMe),
);