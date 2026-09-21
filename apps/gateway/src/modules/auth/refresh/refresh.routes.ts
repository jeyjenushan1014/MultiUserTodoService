import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  refresh,
} from "./refresh.controller.js";

import {
  refreshSessionSchema,
} from "./refresh.validation.js";

export const refreshRouter =
  Router();

refreshRouter.post(
  "/refresh",
  validateBody(
    refreshSessionSchema,
  ),
  asyncHandler(refresh),
);