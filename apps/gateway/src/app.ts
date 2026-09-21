
import express from "express";
import helmet from "helmet";

import {
  errorHandlerMiddleware,
} from "./middleware/error-handler.middleware.js";

import {
  notFoundMiddleware,
} from "./middleware/not-found.middleware.js";

import {
  logoutRouter,
} from "./modules/auth/logout/logout.routes.js";

import {
  requestContextMiddleware,
} from "./middleware/request-context.middleware.js";

import {
  profileRouter,
} from "./modules/user/profile/profile.routes.js";

import {
  requestLoggerMiddleware,
} from "./middleware/request-logger.middleware.js";

import {
  registrationRouter,
} from "./modules/auth/registration/registration.routes.js";

import {
  healthRouter,
} from "./modules/health/health.routes.js";

import {
  loginRouter,
} from "./modules/auth/login/login.routes.js";

import {
  emailChangeRouter,
} from "./modules/user/email-change/email-change.routes.js";

import {
  refreshRouter,
} from "./modules/auth/refresh/refresh.routes.js";

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
  "/api/v1/auth",
  registrationRouter,
);

app.use(
  "/api/v1/auth",
  loginRouter,
);

app.use(
  "/api/v1/auth",
  refreshRouter,
);

app.use(
  "/api/v1/auth",
  logoutRouter,
);
app.use(
  "/api/v1/users",
  profileRouter,
);

app.use(
  "/api/v1/users",
  emailChangeRouter,
);

app.use(
  notFoundMiddleware,
);



app.use(
  errorHandlerMiddleware,
);