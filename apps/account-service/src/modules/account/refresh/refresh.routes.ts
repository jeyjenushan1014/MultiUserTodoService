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
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  refreshController,
} from "./refresh.module.js";

import {
  refreshSessionSchema,
} from "./refresh.validation.js";

export const internalRefreshRouter =
  Router();

internalRefreshRouter.post(
  "/refresh",
  requireInternalService,
  validateBody(
    refreshSessionSchema,
  ),
  asyncHandler(
    refreshController,
  ),
);