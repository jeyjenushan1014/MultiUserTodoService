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
  BcryptPasswordService,
} from "../../../security/password-hasher.js";

import {
  PasswordResetController,
} from "./password-reset.controller.js";

import {
  PostgresPasswordResetRepository,
} from "./password-reset.repository.js";

import {
  PasswordResetService,
} from "./password-reset.service.js";

import {
  confirmPasswordResetSchema,
  passwordResetRequestSchema,
} from "./password-reset.validation.js";

const repository =
  new PostgresPasswordResetRepository();

const passwordHasher =
  new BcryptPasswordService();

const service =
  new PasswordResetService(
    repository,
    passwordHasher,
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

passwordResetRouter.post(
  "/confirm",
  requireInternalService,
  validateBody(
    confirmPasswordResetSchema,
  ),
  controller.confirmReset,
);