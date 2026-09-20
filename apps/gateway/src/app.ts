
import express from "express";
import helmet from "helmet";

import {
  healthRoutes,
} from "./modules/health/health.routes.js";

import {
  errorHandler,
} from "./middleware/error-handler.middleware.js";



import {
  rateLimitMiddleware,
} from "./middleware/rate-limit.middleware.js";

import {
  requestContextMiddleware,
} from "./middleware/request-context.middleware.js";

import {
  requestLoggerMiddleware,
} from "./middleware/request-logger.middleware.js";

import {
  notFoundHandler
} from "./middleware/not-found.middleware.js";


export const app = express();

app.disable("x-powered-by");


app.set(
  "trust proxy",
  1,
);

app.use(
  helmet(),
);

app.use(
  express.json({
    limit: "32kb",
  }),
);


app.use(
  requestContextMiddleware,
);

app.use(
  requestLoggerMiddleware,
);


app.use(
  "/health",
  healthRoutes,
);


app.use(
  "/api",
  rateLimitMiddleware,
);

app.use(
  notFoundHandler,
);

app.use(
  errorHandler,
);