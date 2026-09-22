import {
  Router,
} from "express";

import {
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  passwordResetRequestController,
} from "./password-reset.controller.js";

import {
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