import {
  Router,
} from "express";

import {
  requireInternalServiceKey,
} from "../middleware/internal-service-auth.middleware.js";

import {
  validateBody,
} from "../middleware/validate-body.middleware.js";

import {
  validateParams,
} from "../middleware/validate-params.middleware.js";

import {
  applyOwnerProjectionRebuildBatch,
  completeOwnerProjectionRebuild,
  startOwnerProjectionRebuild,
} from "./owner-projection-rebuild.controller.js";

import {
  completeRebuildParamsSchema,
  rebuildBatchBodySchema,
  rebuildBatchParamsSchema,
  startRebuildBodySchema,
} from "./owner-projection-rebuild.validation.js";

export const ownerProjectionRebuildRouter = Router();

ownerProjectionRebuildRouter.use(requireInternalServiceKey);

ownerProjectionRebuildRouter.post(
  "/",
  validateBody(startRebuildBodySchema),
  startOwnerProjectionRebuild,
);

ownerProjectionRebuildRouter.post(
  "/:rebuildId/batches",
  validateParams(rebuildBatchParamsSchema),
  validateBody(rebuildBatchBodySchema),
  applyOwnerProjectionRebuildBatch,
);

ownerProjectionRebuildRouter.post(
  "/:rebuildId/complete",
  validateParams(completeRebuildParamsSchema),
  completeOwnerProjectionRebuild,
);