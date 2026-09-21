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

function safeEqual(
  received: string,
  expected: string,
): boolean {
  const receivedBuffer =
    Buffer.from(received, "utf8");

  const expectedBuffer =
    Buffer.from(expected, "utf8");

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    receivedBuffer,
    expectedBuffer,
  );
}

export const requireInternalService:
  RequestHandler = (
    request,
    _response,
    next,
  ): void => {
    const receivedSecret =
      request.header(
        "x-internal-service-key",
      );

    if (
      receivedSecret === undefined ||
      !safeEqual(
        receivedSecret,
        env.INTERNAL_SERVICE_SECRET,
      )
    ) {
      next(
        new AppError(
          401,
          "INTERNAL_SERVICE_UNAUTHORIZED",
          "Internal service authentication failed",
        ),
      );

      return;
    }

    next();
  };