import { Router } from "express";
import { asyncHandler } from "@todo/common";

import { requireInternalIdentityMiddleware } from "../../../security/internal-identity.js";
import { exportAccount, requestAccountDeletion, verifyAccountErasure } from "./account-deletion.controller.js";
import { requireInternalService } from "../../../middleware/internal-service-auth.middleware.js";

export const internalAccountDeletionRouter = Router();

internalAccountDeletionRouter.delete(
  "/me",
  requireInternalIdentityMiddleware,
  asyncHandler(requestAccountDeletion),
);

internalAccountDeletionRouter.post(
  "/deletion/verify",
  requireInternalService,
  asyncHandler(verifyAccountErasure),
);

internalAccountDeletionRouter.get(
  "/me/export",
  requireInternalIdentityMiddleware,
  asyncHandler(exportAccount),
);