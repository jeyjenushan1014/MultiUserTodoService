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

try {
  const repository =
    new TaskHistoryProjectionRepository(database);

  const indexer =
    new TaskHistoryIndexer(repository);

  await indexer.verifyConfiguredChain();
  await indexer.rebuild();

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