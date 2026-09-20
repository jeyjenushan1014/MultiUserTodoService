import express from "express";
import helmet from "helmet";

import {
  errorHandlerMiddleware,
} from "./middleware/error-handler.middleware.js";

import {
  notFoundMiddleware,
} from "./middleware/not-found.middleware.js";

import {
  requestContextMiddleware,
} from "./middleware/request-context.middleware.js";

import {
  requestLoggerMiddleware,
} from "./middleware/request-logger.middleware.js";

import {
  healthRouter,
} from "./modules/health/health.routes.js";

export const app =
  express();

app.disable(
  "x-powered-by",
);

app.use(
  helmet(),
);

app.use(
  requestContextMiddleware,
);

app.use(
  requestLoggerMiddleware,
);

app.use(
  express.json({
    limit: "100kb",
    strict: true,
  }),
);

app.use(
  "/health",
  healthRouter,
);

app.use(
  notFoundMiddleware,
);

app.use(
  errorHandlerMiddleware,
);