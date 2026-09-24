import {
  Router,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  validateBody,
} from "../../../middleware/validate-body.middleware.js";

import {
  register,
} from "./registration.controller.js";

import {
  registrationRequestSchema,
} from "./registration.validation.js";

export const registrationRouter =
  Router();

registrationRouter.post(
  "/register",
  validateBody(
    registrationRequestSchema,
  ),
  asyncHandler(register),
);