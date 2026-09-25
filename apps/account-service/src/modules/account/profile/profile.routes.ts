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
  getCurrentAccount,
} from "./profile.controller.js";

export const internalProfileRouter =
  Router();

internalProfileRouter.get(
  "/me",
  requireInternalIdentityMiddleware,
  asyncHandler(
    getCurrentAccount,
  ),
);