import pino from "pino";

import {
  getRequestId,
} from "@todo/common";

import {
  env,
} from "./env.js";

export const logger = pino({
  name: "account-service",
  level: env.LOG_LEVEL,

  base: {
    service: "account-service",
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
      "DATABASE_URL",
      "databaseUrl",
      "connectionString",
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