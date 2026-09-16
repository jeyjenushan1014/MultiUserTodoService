import express from "express";
import helmet from "helmet";
import { authRouter } from "./features/auth/auth.routes.js";

import {
  errorHandler,
  routeNotFoundHandler,
} from "./middleware/error-handler.middleware.js";
import { healthRouter } from "./features/health/health.routes.js";
import { todoRouter } from "./features/todo/todo.routes.js";

export const app = express();

// Disable the "X-Powered-By" header to prevent exposing information about the server technology being used. 
// This is a security best practice to reduce the risk of targeted attacks based on known vulnerabilities in specific server technologies.
app.disable("x-powered-by");

// Use Helmet to set various HTTP headers for security purposes.
//It protects against some well-known web vulnerabilities by setting appropriate HTTP headers.
app.use(helmet());


//limit the size of incoming JSON payloads to 32 kilobytes.
//This helps prevent denial-of-service (DoS) attacks where an attacker might send a very large payload to exhaust server resources.
app.use(
  express.json({
    limit: "32kb",
  }),
);


app.use("/api/v1/auth", authRouter);
app.use("/health", healthRouter);
app.use("/api/v1/todo",todoRouter);

app.use(routeNotFoundHandler);
app.use(errorHandler);