import pino from "pino";

import {
  getRequestContext,
} from "@todo/common";

import {
  env,
} from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,

  base: {
    service: "gateway",
  },

  mixin: (): Record<string, unknown> => {
    const context =
      getRequestContext();

    if (context === undefined) {
      return {};
    }

    return {
      requestId: context.requestId,
      userId: context.userId,
    };
  },

  redact: {
    paths: [
      "password",
      "newPassword",
      "currentPassword",
      "accessToken",
      "refreshToken",
      "resetToken",
      "authorization",
      "req.headers.authorization",
      "headers.authorization",
    ],

    censor: "[REDACTED]",
  },
});