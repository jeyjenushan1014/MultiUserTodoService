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
  getCurrentAccount,
} from "./profile.controller.js";

export const internalProfileRouter =
  Router();

internalProfileRouter.get(
  "/me",
  requireInternalService,
  asyncHandler(
    getCurrentAccount,
  ),
);