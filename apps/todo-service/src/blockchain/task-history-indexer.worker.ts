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
const indexers = [
  indexer,
  ...env.CHAIN_PREVIOUS_CONTRACTS.map((deployment) => new TaskHistoryIndexer(repository, deployment)),
];

let shuttingDown = false;

function wait(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function run(): Promise<void> {
  logger.info(
    { chainId: env.CHAIN_ID, contractAddress: env.TASK_HISTORY_CONTRACT_ADDRESS },
    "Task-history chain indexer started",
  );
  while (!shuttingDown) {
    const lockClient = await repository.acquireWorkerLock(lockName);
    if (lockClient !== undefined) {
      try {
        await indexer.verifyConfiguredChain();
        for (const configuredIndexer of indexers) await configuredIndexer.pollOnce();
      } catch (error) {
        logger.error(
          { err: error },
          "Chain indexer poll failed; will retry",
        );
      } finally {
        await repository.releaseWorkerLock(lockClient, lockName);
      }
    }
    await wait(env.CHAIN_POLL_INTERVAL_MS);
  }
}

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    { signal },
    "Task-history chain indexer shutting down",
  );

}

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  shutdown("SIGINT");
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