import type {
  RequestHandler,
} from "express";

import {
  getRequestId,
} from "@todo/common";

import {
  logoutAllSessions,
  logoutSession,
} from "../../../clients/account-service.client.js";

import {
  verifyAccessToken,
} from "../../../security/access-token-verifier.js";

function requireRequestId():
  string {
  const requestId =
    getRequestId();

  if (requestId === undefined) {
    throw new Error(
      "Request context is unavailable",
    );
  }

  return requestId;
}

export const logout:
  RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const identity =
      await verifyAccessToken(
        request,
      );

    await logoutSession(
      identity,
      requireRequestId(),
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
      await verifyAccessToken(
        request,
      );

    await logoutAllSessions(
      identity,
      requireRequestId(),
    );

    response
      .status(204)
      .send();
  };