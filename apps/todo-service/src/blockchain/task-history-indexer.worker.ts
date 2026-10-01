import {
  database,
} from "../config/database.js";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  TaskHistoryIndexer,
} from "./task-history-indexer.js";

import {
  TaskHistoryProjectionRepository,
} from "./task-history-projection.repository.js";

const lockName =
  `task-history-indexer:${env.CHAIN_ID}:${env.TASK_HISTORY_CONTRACT_ADDRESS.toLowerCase()}`;

const repository =
  new TaskHistoryProjectionRepository(database);

const indexer =
  new TaskHistoryIndexer(repository);

let shuttingDown = false;

function wait(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

async function run(): Promise<void> {
  const lockClient =
    await repository.acquireWorkerLock(lockName);

  if (lockClient === undefined) {
    logger.info(
      "Another chain indexer owns the PostgreSQL advisory lock; exiting",
    );
    return;
  }

  try {
    await indexer.verifyConfiguredChain();

    logger.info(
      {
        chainId: env.CHAIN_ID,
        contractAddress: env.TASK_HISTORY_CONTRACT_ADDRESS,
        confirmations: env.CHAIN_CONFIRMATIONS,
      },
      "Task-history chain indexer started",
    );

    while (!shuttingDown) {
      try {
        await indexer.pollOnce();
      } catch (error) {
        logger.error(
          { err: error },
          "Chain indexer poll failed; will retry",
        );
      }

      await wait(env.CHAIN_POLL_INTERVAL_MS);
    }
  } finally {
    await repository.releaseWorkerLock(
      lockClient,
      lockName,
    );
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    { signal },
    "Task-history chain indexer shutting down",
  );

  await database.end();
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

void run()
  .catch((error: unknown) => {
    logger.fatal(
      { err: error },
      "Task-history chain indexer stopped unexpectedly",
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void database.end();
  });