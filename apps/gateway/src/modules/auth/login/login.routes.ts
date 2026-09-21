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
  login,
} from "./login.controller.js";

import {
  loginRequestSchema,
} from "./login.validation.js";

export const loginRouter =
  Router();

loginRouter.post(
  "/login",
  validateBody(loginRequestSchema),
  asyncHandler(login),
);