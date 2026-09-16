import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validate.js";
import * as authController from "./auth.controller.js";
import { credentialsSchema } from "./auth.validation.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  validate(credentialsSchema),
  asyncHandler(authController.register),
);
