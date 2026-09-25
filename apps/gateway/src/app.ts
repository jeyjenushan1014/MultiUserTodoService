
import express from "express";
import helmet from "helmet";

import {
  errorHandlerMiddleware,
} from "./middleware/error-handler.middleware.js";

import {
  authenticationRateLimit,
  generalApiRateLimit,
} from "./rate-limit/rate-limit.composition.js";

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
  todoRouter
} from "./modules/todo/todo.routes.js"

import {
  requestLoggerMiddleware,
} from "./middleware/request-logger.middleware.js";

import {
  env,
} from "./config/env.js";

import {
  passwordResetRouter,
} from "./modules/auth/password-reset/password-reset.routes.js";


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
    limit: env.REQUEST_BODY_LIMIT,
    strict: true,
  }),
);

app.use(
  "/health",
  healthRouter,
);

app.use(
  "/api/v1",
  generalApiRateLimit,
);

app.use(
  "/api/v1/auth",
  authenticationRateLimit,
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
  "/api/v1/auth/password-reset",
  passwordResetRouter,
);

app.use(
  "/api/v1/todos",
  todoRouter,
);

app.use(
  notFoundMiddleware,
);



app.use(
  errorHandlerMiddleware,
);