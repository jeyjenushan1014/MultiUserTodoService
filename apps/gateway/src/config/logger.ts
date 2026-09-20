/*
It gives json structured logs, not sent the stack trace to the client
*/

import pino from "pino";

import {
  getRequestId,
} from "@todo/common";

import {
  env,
} from "./env.js";

export const logger = pino({
  name: "gateway",
  level: env.LOG_LEVEL,

  base: {
    service: "gateway",
    environment: env.NODE_ENV,
  },

  redact: {
    paths: [
      "password",
      "*.password",
      "body.password",
      "request.body.password",
      "authorization",
      "headers.authorization",
      "request.headers.authorization",
      "accessToken",
      "refreshToken",
      "resetToken",
      "*.accessToken",
      "*.refreshToken",
      "*.resetToken",
    ],
    censor: "[REDACTED]",
  },

  mixin(): Record<string, string> {
    const requestId =
      getRequestId();

    return requestId === undefined
      ? {}
      : {
          requestId,
        };
  },
});