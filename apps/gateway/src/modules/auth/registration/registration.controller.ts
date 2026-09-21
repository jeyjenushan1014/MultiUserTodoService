import type {
  RequestHandler,
} from "express";

import type {
  RegisterAccountRequest,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import {
  registerAccount,
} from "../../../clients/account-service.client.js";

export const register:
  RequestHandler = async (
    request,
    response,
  ) => {
    const requestId =
      getRequestId();

    if (requestId === undefined) {
      throw new Error(
        "Request context is unavailable",
      );
    }

    const result =
      await registerAccount(
        request.body as
          RegisterAccountRequest,
        requestId,
      );

    response
      .status(201)
      .json(result);
  };