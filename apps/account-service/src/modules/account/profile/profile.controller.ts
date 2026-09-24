import type {
  RequestHandler,
} from "express";

import type {
  CurrentAccountResponse,
} from "@todo/contracts";

import {
  requireInternalIdentity,
} from "../../../security/internal-identity.js";

import {
  profileService,
} from "./profile.module.js";

export const getCurrentAccount:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      requireInternalIdentity(
        request,
      );

    const user =
      await profileService
        .getCurrentAccount(
          identity.userId,
          identity.sessionId,
        );

    const responseBody:
      CurrentAccountResponse = {
        data: {
          user,
        },
      };

    response
      .status(200)
      .json(responseBody);
  };