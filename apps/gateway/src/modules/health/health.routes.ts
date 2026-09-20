import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  getHealth,
  getLiveness,
  getReadiness,
} from "./health.controller.js";

export const healthRoutes =
  Router();

healthRoutes.get(
  "/live",
  getLiveness,
);

healthRoutes.get(
  "/ready",
  asyncHandler(getReadiness),
);

healthRoutes.get(
  "/",
  asyncHandler(getHealth),
);