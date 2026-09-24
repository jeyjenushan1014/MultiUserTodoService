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
  registrationController,
} from "./registration.module.js";

import {
  registrationRequestSchema,
} from "./registration.validation.js";


export const internalRegistrationRouter =
  Router();

internalRegistrationRouter.post(
  "/register",
  requireInternalService,
  validateBody(
    registrationRequestSchema,
  ),
  asyncHandler(
    registrationController,
  ),
);


