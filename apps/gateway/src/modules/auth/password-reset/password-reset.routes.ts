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

export const passwordResetRouter =
  Router();

passwordResetRouter.post(
  "/request",
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