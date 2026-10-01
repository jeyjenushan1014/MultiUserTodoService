import express from "express";

import helmet from "helmet";

import {
  env,
} from "./config/env.js";

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

import {
  todoRouter,
} from "./modules/todo/todo.routes.js";

import {
  ownerProjectionRebuildRouter,
} from "./messaging/owner-projection-rebuild.routes.js";

import { workflowParticipantRouter } from "./workflow/workflow-participant.routes.js";
import { accountDeletionRouter } from "./account-deletion/account-deletion.routes.js";

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
    limit:
      env.REQUEST_BODY_LIMIT,
  }),
);

app.use(
  "/health",
  healthRouter,
);

app.use(
  "/internal/v1/todos",
  todoRouter,
);

app.use(
  "/internal/v1/owner-projection-rebuilds",
  ownerProjectionRebuildRouter,
);

app.use(
  "/internal/v1/workflow-participations",
  workflowParticipantRouter,
)

app.use(
  "/internal/v1/account-deletions",
  accountDeletionRouter,
)


app.use(
  notFoundMiddleware,
);

app.use(
  errorHandlerMiddleware,
);