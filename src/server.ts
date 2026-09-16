import { app } from "./app.js";
import { cache, connectCache } from "./config/cache.js";
import {
  database,
  verifyDatabaseConnection,
} from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

async function startServer(): Promise<void> {
  try {
    await verifyDatabaseConnection();

    try {
      await connectCache();
    } catch (error) {
      logger.warn(
        { error },
        "Redis unavailable; starting in degraded mode",
      );
    }

    const server = app.listen(
      env.PORT,
      () => {
        logger.info(
          { port: env.PORT },
          "TODO service started",
        );
      },
    );

    /*
    Shutdown gracefully on SIGTERM or SIGINT.
     This is important for containerized environments like Docker, where the process may be terminated by the orchestrator.
      We want to ensure that we close the server and any open connections (like database or cache) before exiting.
    */
    const shutdown = (signal: string): void => {
      logger.info({ signal }, "Shutting down");

      server.close(() => {
        void Promise.allSettled([
          database.end(),
          cache.isOpen
            ? cache.quit()
            : Promise.resolve(),
        ]).finally(() => process.exit(0));
      });
    };

    process.on(
      "SIGTERM",
      () => shutdown("SIGTERM"),
    );

    process.on(
      "SIGINT",
      () => shutdown("SIGINT"),
    );
  } catch (error) {
    logger.fatal(
      { error },
      "Startup failed because a required dependency or configuration is unavailable",
    );

    process.exit(1);
  }
}

void startServer();