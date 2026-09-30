#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresWorkspaceRepository } from "../dist/modules/workspace/workspace.repository.js";

const databaseUrl = process.env.ACCOUNT_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("ACCOUNT_DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const repository = new PostgresWorkspaceRepository();
const suffix = randomUUID();
const actorA = randomUUID();
const actorB = randomUUID();
const workspaceId = randomUUID();
const changedAt = new Date();

try {
  await pool.query(
    `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3), ($4, $5, $3)`,
    [actorA, `tn9-a-${suffix}@example.com`, "integration-test-hash", actorB, `tn9-b-${suffix}@example.com`],
  );
  await pool.query(
    `INSERT INTO workspaces (id, name, created_by) VALUES ($1, $2, $3)`,
    [workspaceId, `TN-9 ${suffix}`, actorA],
  );
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'administrator'), ($1, $3, 'administrator')`,
    [workspaceId, actorA, actorB],
  );

  const results = await Promise.all([
    repository.removeMember({
      workspaceId,
      actorId: actorA,
      userId: actorB,
      eventId: randomUUID(),
      requestId: randomUUID(),
      changedAt,
    }),
    repository.removeMember({
      workspaceId,
      actorId: actorB,
      userId: actorA,
      eventId: randomUUID(),
      requestId: randomUUID(),
      changedAt,
    }),
  ]);

  const changedCount = results.filter((result) => result === "changed").length;
  const remaining = await pool.query(
    `SELECT COUNT(*)::int AS count FROM workspace_members WHERE workspace_id = $1 AND role = 'administrator'`,
    [workspaceId],
  );
  const administratorCount = remaining.rows[0].count;

  if (changedCount !== 1 || administratorCount < 1) {
    throw new Error(`TN-9 failed: results=${results.join(",")}, administrators=${administratorCount}`);
  }

  console.info(`TN-9 concurrency proof passed: results=${results.join(",")}, administrators=${administratorCount}`);
} finally {
  await pool.query(`DELETE FROM outbox_events WHERE aggregate_id = $1`, [workspaceId]);
  await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [actorA, actorB]);
  await pool.end();
}
