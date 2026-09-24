import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validate.js";
import * as authController from "./auth.controller.js";
import { credentialsSchema } from "./auth.validation.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  validate(credentialsSchema),
  asyncHandler(authController.register),
);

authRouter.post(
  "/login",
  validate(credentialsSchema),
  asyncHandler(authController.login),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(authController.getCurrentUser),
);