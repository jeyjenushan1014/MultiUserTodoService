import {
  Router,
} from "express";

import {
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  confirmPasswordResetController,
  passwordResetRequestController,
} from "./password-reset.controller.js";

import {
  confirmPasswordResetSchema,
  passwordResetRequestSchema,
} from "./password-reset.validation.js";
import { passwordResetRateLimit } from "../../../rate-limit/rate-limit.composition.js";

export const passwordResetRouter =
  Router();

passwordResetRouter.post(
  "/request",
  passwordResetRateLimit,
  validateBody(
    passwordResetRequestSchema,
  ),
  passwordResetRequestController,
);

passwordResetRouter.post(
  "/confirm",
  validateBody(
    confirmPasswordResetSchema,
  ),
  confirmPasswordResetController,
);