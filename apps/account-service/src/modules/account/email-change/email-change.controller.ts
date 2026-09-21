import type {
  RequestHandler,
} from "express";

import {
  getRequestId,
} from "@todo/common";

import {
  requireInternalIdentity,
} from "../../../security/internal-identity.js";

import {
  emailChangeService,
} from "./email-change.module.js";

import type {
  ChangeEmailInput,
} from "./email-change.validation.js";

export const changeEmail:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(
        request,
      );

    const requestId =
      getRequestId();

    if (requestId === undefined) {
      throw new Error(
        "Request context is unavailable",
      );
    }

    const result =
      await emailChangeService
        .changeEmail(
          identity.userId,
          identity.sessionId,
          requestId,
          request.body as
            ChangeEmailInput,
        );

    response
      .status(200)
      .json(result);
  };