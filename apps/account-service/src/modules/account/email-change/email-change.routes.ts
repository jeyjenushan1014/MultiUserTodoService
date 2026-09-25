import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  requireInternalIdentityMiddleware,
} from "../../../security/internal-identity.js";

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
  requireInternalIdentityMiddleware,
  validateBody(
    changeEmailSchema,
  ),
  asyncHandler(changeEmail),
);