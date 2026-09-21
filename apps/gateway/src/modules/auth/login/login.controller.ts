import type {
  RequestHandler,
} from "express";

import type {
  LoginAccountRequest,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";


import {
  loginAccount,
} from "../../../clients/account-service.client.js";
 

export const login:
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
      await loginAccount(
        request.body as
          LoginAccountRequest,
        requestId,
      );

    response
      .status(200)
      .json(result);
  };