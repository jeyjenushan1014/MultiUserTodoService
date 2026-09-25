import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  authenticate,
} from "../../../middleware/authenticate.middleware.js";

import {
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  changeEmail,
} from "./email-change.controller.js";

import {
  changeEmailSchema,
} from "./email-change.validation.js";

export const emailChangeRouter =
  Router();

emailChangeRouter.patch(
  "/me/email",
  authenticate,
  validateBody(
    changeEmailSchema,
  ),
  asyncHandler(changeEmail),
);