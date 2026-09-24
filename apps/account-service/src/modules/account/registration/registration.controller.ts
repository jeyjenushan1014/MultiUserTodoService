import type {
  RequestHandler,
} from "express";

import type {
  RegisterAccountResponse,
} from "@todo/contracts";

import {
  getRequestId,
} from "@todo/common";

import type {
  RegistrationService,
} from "./registration.service.js";

import type {
  RegistrationInput,
} from "./registration.validation.js";

export function createRegistrationController(
  registrationService:
    RegistrationService,
): RequestHandler {
  return async (
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

    const user =
      await registrationService.register(
        request.body as
          RegistrationInput,
        requestId,
      );

    const responseBody:
      RegisterAccountResponse = {
        data: {
          user,
        },
      };

    response
      .status(201)
      .json(responseBody);
  };
}