import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  requireInternalService,
} from "../../../middleware/internal-service-auth.middleware.js";

import {
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  changeEmail,
} from "./email-change.controller.js";

import {
  changeEmailSchema,
} from "./email-change.validation.js";

export const internalEmailChangeRouter =
  Router();

internalEmailChangeRouter.patch(
  "/me/email",
  requireInternalService,
  validateBody(
    changeEmailSchema,
  ),
  asyncHandler(changeEmail),
);