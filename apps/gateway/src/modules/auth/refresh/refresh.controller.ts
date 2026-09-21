import type {
  RequestHandler,
} from "express";

import type {
  RefreshSessionRequest,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  refreshSession,
} from "../../../clients/account-service.client.js";

export const refresh:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const requestId =
      getRequestId();

    if (requestId === undefined) {
      throw new Error(
        "Request context is unavailable",
      );
    }

    const result =
      await refreshSession(
        request.body as
          RefreshSessionRequest,
        requestId,
      );

    response
      .status(200)
      .json(result);
  };