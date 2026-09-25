import {
  Router,
} from "express";

import {
  getHealthController,
  getDependencyHealthController,
} from "./health.controller.js";

export const healthRouter =
  Router();

healthRouter.get(
  "/",
  getHealthController,
);

healthRouter.get(
  "/dependencies",
  getDependencyHealthController,
);