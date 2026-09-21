/*
 * It produces structured JSON logs.
 * Stack traces and sensitive values are not sent to clients.
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
      /*
       * Password fields at different
       * possible object locations.
       */
      "password",
      "passwordHash",
      "password_hash",
      "req.body.password",
      "request.body.password",

      /*
       * Authentication headers.
       */
      "authorization",
      "req.headers.authorization",
      "request.headers.authorization",

      /*
       * Property names containing hyphens
       * require bracket notation.
       */
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