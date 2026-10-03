import {
  database,
} from "../config/database.js";

import {
  logger,
} from "../config/logger.js";

import {
  TaskHistoryIndexer,
} from "./task-history-indexer.js";

import {
  TaskHistoryProjectionRepository,
} from "./task-history-projection.repository.js";
import { env } from "../config/env.js";

try {
  const repository =
    new TaskHistoryProjectionRepository(database);

  const indexer =
    new TaskHistoryIndexer(repository);

  await indexer.verifyConfiguredChain();
  const lockName = `task-history-indexer:${env.CHAIN_ID}:${env.TASK_HISTORY_CONTRACT_ADDRESS.toLowerCase()}`;
  let lock = await repository.acquireWorkerLock(lockName);
  const deadline = Date.now() + 30000;
  while (!lock && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    lock = await repository.acquireWorkerLock(lockName);
  }
  if (!lock) throw new Error("Chain scan remained busy for 30 seconds; retry projection rebuild");
  try {
    await indexer.rebuild();
    for (const deployment of env.CHAIN_PREVIOUS_CONTRACTS) {
      await new TaskHistoryIndexer(repository, deployment).rebuild();
    }
  } finally {
    await repository.releaseWorkerLock(lock, lockName);
  }

  logger.info(
    "Chain projection rebuild completed",
  );
} catch (error) {
  logger.error(
    { err: error },
    "Chain projection rebuild failed",
  );
  process.exitCode = 1;
} finally {
  await database.end();
}