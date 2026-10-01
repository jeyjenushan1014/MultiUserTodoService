import { Router } from "express";

import { requireInternalServiceKey } from "../middleware/internal-service-auth.middleware.js";
import { exportAccountData, eraseAccountData, purgeAccountWorkspaceCache, verifyAccountErasure } from "./account-deletion.controller.js";
import { requireInternalIdentity } from "../middleware/internal-service-auth.middleware.js";

export const accountDeletionRouter = Router();

accountDeletionRouter.get("/export", requireInternalIdentity, exportAccountData);

accountDeletionRouter.delete("/", requireInternalServiceKey, eraseAccountData);
accountDeletionRouter.delete("/cache", requireInternalServiceKey, purgeAccountWorkspaceCache);
accountDeletionRouter.post("/verify", requireInternalServiceKey, verifyAccountErasure);