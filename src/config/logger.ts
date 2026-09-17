// This file is responsible for configuring the logger for the application.
import pino from "pino";
import { env } from "./env.js";


export const logger = pino({
  level: env.LOG_LEVEL,

  //redact sensitive information from logs to prevent accidental exposure of secrets or personal data. 
  // The paths specified in the redact option will be replaced with the censor value in the log output.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.body.password",
      "password",
      "*.password",
      "*.accessToken",
      "*.token",
      "res.headers.set-cookie",
    ],
    censor: "[REDACTED]",
  },
});
