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
  internalEmailChangeRouter,
} from "./modules/account/email-change/email-change.routes.js";

import {
  healthRouter,
} from "./modules/health/health.routes.js";

import {
  internalRegistrationRouter,
} from "./modules/account/registration/registration.routes.js";

import {
  passwordResetRouter,
} from "./modules/account/password-reset/password-reset.routes.js";

import {
  internalLoginRouter,
} from "./modules/account/login/login.routes.js";

import {
  internalRefreshRouter,
} from "./modules/account/refresh/refresh.routes.js";

import {
  internalLogoutRouter,
} from "./modules/account/logout/logout.routes.js";

import {
  internalProfileRouter,
} from "./modules/account/profile/profile.routes.js";

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
  "/internal/v1/accounts",
  internalProfileRouter,
);

app.use(
  "/internal/v1/auth",
  internalLoginRouter,
);

app.use(
  "/internal/v1/auth",
  internalRefreshRouter,
);

app.use(
  "/internal/v1/auth",
  internalLogoutRouter,
);

app.use(
  "/internal/v1/accounts",
  internalEmailChangeRouter,
);

app.use(
  "/internal/v1/auth/password-reset",
  passwordResetRouter,
);

app.use(
  notFoundMiddleware,
);

app.use(
  errorHandlerMiddleware,
);