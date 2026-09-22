import {
  Router,
} from "express";

import {
  HealthController,
} from "./health.controller.js";

import {
  SystemHealthDependencyProbe,
} from "./health.probe.js";

import {
  HealthService,
} from "./health.service.js";

const probe =
  new SystemHealthDependencyProbe();

const service =
  new HealthService(
    probe,
  );

const controller =
  new HealthController(
    service,
  );

export const healthRouter =
  Router();

healthRouter.get(
  "/live",
  controller.liveness,
);

healthRouter.get(
  "/ready",
  controller.readiness,
);