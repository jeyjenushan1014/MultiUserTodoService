/*
Protects Account Service internal routes.

Registration, login, refresh and password-reset
operations do not yet have an authenticated caller,
but they must still prove that the request originated
from the Gateway.
*/

import {
  timingSafeEqual,
} from "node:crypto";

import type {
  RequestHandler,
} from "express";

import {
  AppError,
} from "@todo/common";

import {
  env,
} from "../config/env.js";

const INTERNAL_SERVICE_KEY_HEADER =
  "x-internal-service-key";

function createAuthenticationError():
  AppError {
  return new AppError(
    401,
    "UNAUTHORIZED_INTERNAL_REQUEST",
    "Internal request authentication failed",
  );
}

function secretsMatch(
  suppliedSecret:
    string,
  expectedSecret:
    string,
): boolean {
  const suppliedBuffer =
    Buffer.from(
      suppliedSecret,
      "utf8",
    );

  const expectedBuffer =
    Buffer.from(
      expectedSecret,
      "utf8",
    );

  if (
    suppliedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    suppliedBuffer,
    expectedBuffer,
  );
}

export const requireInternalService:
  RequestHandler = (
    request,
    _response,
    next,
  ): void => {
    const suppliedServiceKey =
      request.header(
        INTERNAL_SERVICE_KEY_HEADER,
      );

    if (
      suppliedServiceKey === undefined ||
      suppliedServiceKey.length === 0 ||
      !secretsMatch(
        suppliedServiceKey,
        env.INTERNAL_SERVICE_SECRET,
      )
    ) {
      next(
        createAuthenticationError(),
      );

      return;
    }

    next();
  };