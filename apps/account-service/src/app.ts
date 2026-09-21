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
} from "./middleware/request-context.midddleware.js";

import {
  healthRouter,
} from "./modules/health/health.routes.js";

import {
  internalRegistrationRouter,
} from "./modules/account/registration/registration.routes.js";

import {
  internalLoginRouter,
} from "./modules/account/login/login.routes.js";

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
  "/internal/v1/accounts",
  internalRegistrationRouter,
);

app.use(
  "/internal/v1/auth",
  internalLoginRouter,
);


app.use(
  notFoundMiddleware,
);

app.use(
  errorHandlerMiddleware,
);