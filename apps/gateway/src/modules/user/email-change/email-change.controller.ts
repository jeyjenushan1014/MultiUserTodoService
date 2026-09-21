import type {
  RequestHandler,
} from "express";

import type {
  ChangeEmailRequest,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  changeAccountEmail,
} from "../../../clients/account-service.client.js";

import {
  verifyAccessToken,
} from "../../../security/access-token-verifier.js";

export const changeEmail:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      await verifyAccessToken(
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
      await changeAccountEmail(
        identity,
        request.body as
          ChangeEmailRequest,
        requestId,
      );

    response
      .status(200)
      .json(result);
  };