import type {
  RequestHandler,
} from "express";

import {
  requireInternalIdentity,
} from "../../../security/internal-identity.js";

import {
  logoutService,
} from "./logout.module.js";

export const logout:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(
        request,
      );

    await logoutService.logout(
      identity.userId,
      identity.sessionId,
    );

    response
      .status(204)
      .send();
  };

export const logoutAll:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(
        request,
      );

    await logoutService.logoutAll(
      identity.userId,
    );

    response
      .status(204)
      .send();
  };