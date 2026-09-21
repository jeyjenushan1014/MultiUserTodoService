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
    "passwordHash",
    "password_hash",
    "req.body.password",
    "authorization",
    "req.headers.authorization",
     "['x-internal-service-key']",
      "req.headers['x-internal-service-key']",
      "request.headers['x-internal-service-key']",
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