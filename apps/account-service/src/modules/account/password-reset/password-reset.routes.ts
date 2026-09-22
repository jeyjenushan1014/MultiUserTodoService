import {
  Router,
} from "express";

import {
  requireInternalService,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  PostgresPasswordResetRepository,
} from "./password-reset.repository.js";

import {
  PasswordResetService,
} from "./password-reset.service.js";

import {
  PasswordResetController,
} from "./password-reset.controller.js";

import {
  passwordResetRequestSchema,
} from "./password-reset.validation.js";

const repository =
  new PostgresPasswordResetRepository();

const service =
  new PasswordResetService(
    repository,
  );

const controller =
  new PasswordResetController(
    service,
  );

export const passwordResetRouter =
  Router();

passwordResetRouter.post(
  "/request",
  requireInternalService,
  validateBody(
    passwordResetRequestSchema,
  ),
  controller.requestReset,
);