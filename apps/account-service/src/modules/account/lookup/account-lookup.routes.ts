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
  resolveAccountController,
} from "./account-lookup.controller.js";

import {
  resolveAccountBodySchema,
} from "./account-lookup.validation.js";

export const accountLookupRouter =
  Router();

accountLookupRouter.post(
  "/resolve",
  requireInternalService,
  validateBody(
    resolveAccountBodySchema,
  ),
  resolveAccountController,
);