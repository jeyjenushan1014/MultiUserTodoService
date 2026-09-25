import {
  randomUUID,
} from "node:crypto";

import type {
  QueryResultRow,
} from "pg";

import {
  database,
  closeDatabase,
} from "../config/database.js";

import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

interface AccountUserRow extends QueryResultRow {
  readonly id: string;
  readonly email: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface RebuildResult {
  readonly upserted: number;
  readonly alreadyPresent: number;
}

async function postJson<TResponse>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const response = await fetch(
    `${env.TODO_SERVICE_URL.replace(/\/$/u, "")}${path}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-key": env.INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Todo owner projection request failed (${response.status} ${response.statusText})`,
    );
  }

  return response.json() as Promise<TResponse>;
}

async function rebuildOwnerProjection(): Promise<void> {
  const rebuildId = randomUUID();
  let cursor: string | undefined;
  let batchCount = 0;
  let userCount = 0;
  let upserted = 0;
  let alreadyPresent = 0;

  await postJson(
    "/internal/v1/owner-projection-rebuilds/",
    { rebuildId },
  );

  logger.info({ rebuildId }, "Owner projection rebuild started");

  for (;;) {
    const result = await database.query<AccountUserRow>(
      `
        SELECT id, email, created_at, updated_at
        FROM users
        WHERE ($1::uuid IS NULL OR id > $1::uuid)
        ORDER BY id
        LIMIT $2
      `,
      [cursor ?? null, env.OWNER_PROJECTION_REBUILD_BATCH_SIZE],
    );

    if (result.rows.length === 0) {
      break;
    }

    const batch = result.rows.map((user) => ({
      userId: user.id,
      email: user.email,
      accountCreatedAt: user.created_at.toISOString(),
      projectionOccurredAt: user.updated_at.toISOString(),
    }));

    const batchResult = await postJson<RebuildResult>(
      `/internal/v1/owner-projection-rebuilds/${rebuildId}/batches`,
      { users: batch },
    );

    batchCount += 1;
    userCount += batch.length;
    upserted += batchResult.upserted;
    alreadyPresent += batchResult.alreadyPresent;
    cursor = result.rows[result.rows.length - 1]?.id;

    logger.info(
      {
        rebuildId,
        batch: batchCount,
        users: batch.length,
        totalUsers: userCount,
        upserted: batchResult.upserted,
        alreadyPresent: batchResult.alreadyPresent,
      },
      "Owner projection rebuild batch applied",
    );
  }

  const completion = await postJson<{ readonly deactivated: number }>(
    `/internal/v1/owner-projection-rebuilds/${rebuildId}/complete`,
    {},
  );

  logger.info(
    {
      rebuildId,
      batches: batchCount,
      users: userCount,
      upserted,
      alreadyPresent,
      deactivated: completion.deactivated,
    },
    "Owner projection rebuild completed",
  );
}

try {
  await rebuildOwnerProjection();
} catch (error) {
  logger.error({ err: error }, "Owner projection rebuild failed");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}