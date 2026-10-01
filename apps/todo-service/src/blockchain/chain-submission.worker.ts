import { database } from "../config/database.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ChainSubmissionService } from "./chain-submission.service.js";

const workerId = `chain-submission-worker:${process.pid}`;
let shuttingDown = false;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

async function run(): Promise<void> {
  logger.info(
    {
      workerId,
      chainId: env.CHAIN_ID,
      contractAddress: env.TASK_HISTORY_CONTRACT_ADDRESS,
    },
    "Chain submission worker started",
  );

  const service = new ChainSubmissionService({
    pool: database,
  });

  while (!shuttingDown) {
    try {
      const processedCount = await service.pollAndSubmit(database, workerId, 5);
      if (processedCount === 0) {
        await wait(env.CHAIN_POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Chain submission worker loop encountered an error; will retry",
      );
      await wait(env.CHAIN_POLL_INTERVAL_MS);
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Chain submission worker shutting down");
  await database.end();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

void run()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, "Chain submission worker crashed");
    process.exitCode = 1;
  })
  .finally(() => void database.end());
