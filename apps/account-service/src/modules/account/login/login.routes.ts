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
  loginController,
} from "./login.module.js";

import {
  loginRequestSchema,
} from "./login.validation.js";

export const internalLoginRouter =
  Router();

internalLoginRouter.post(
  "/login",
  requireInternalService,
  validateBody(loginRequestSchema),
  asyncHandler(loginController),
);