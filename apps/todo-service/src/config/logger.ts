import pino from "pino";

import {
  getRequestId,
} from "@todo/common";

import {
  env,
} from "./env.js";

export const logger = pino({
  name: "todo-service",

  level:
    env.LOG_LEVEL,

  base: {
    service:
      "todo-service",

    environment:
      env.NODE_ENV,
  },

  redact: {
    paths: [
      "password",
      "newPassword",
      "refreshToken",
      "resetToken",
      "authorization",
      "req.body.password",
      "req.body.newPassword",
      "req.body.refreshToken",
      "req.body.resetToken",
      "req.headers.authorization",
      "req.headers['x-internal-service-key']",
      "['x-internal-service-key']",
    ],

    censor:
      "[REDACTED]",
  },

  mixin():
  Record<string, string> {
    const requestId =
      getRequestId();

    return requestId === undefined
      ? {}
      : {
          requestId,
        };
  },
});