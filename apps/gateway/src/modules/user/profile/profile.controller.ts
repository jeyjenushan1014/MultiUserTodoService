import type {
  RequestHandler,
} from "express";

import {
  getRequestId,
} from "@todo/common";

import {
  getCurrentAccount,
} from "../../../clients/account-service.client.js";

import {
  getCallerIdentity,
} from "../../../middleware/authenticate.middleware.js";

export const getMe:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      getCallerIdentity(response);

    const requestId =
      getRequestId();

    if (requestId === undefined) {
      throw new Error(
        "Request context is unavailable",
      );
    }

    const result =
      await getCurrentAccount(
        identity,
        requestId,
      );

    response
      .status(200)
      .json(result);
  };