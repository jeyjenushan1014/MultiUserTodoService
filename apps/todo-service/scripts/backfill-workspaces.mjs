#!/usr/bin/env node
/*
Backfill `workspace_id` on TODOs by querying Account Service for each owner.

Usage:
  node backfill-workspaces.mjs --account-url <url> --internal-key <secret> [--apply]

Environment:
  TODO_DATABASE_URL required if not provided in the environment.

Behavior:
  - Dry-run by default: prints summary and writes ambiguous cases to CSV.
  - With `--apply` updates TODO rows where exactly one workspace is returned.
*/

import pg from "pg";
import fs from "fs";
import fetch from "node-fetch";

const argv = process.argv.slice(2);
const hasApply = argv.includes("--apply");

function getArg(name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

const ACCOUNT_SERVICE_URL = getArg("--account-url") || process.env.ACCOUNT_SERVICE_URL;
const INTERNAL_SERVICE_KEY = getArg("--internal-key") || process.env.INTERNAL_SERVICE_SECRET;
const TODO_DATABASE_URL = process.env.TODO_DATABASE_URL;

if (!ACCOUNT_SERVICE_URL) {
  console.error("ACCOUNT_SERVICE_URL is required via --account-url or env");
  process.exit(2);
}

if (!INTERNAL_SERVICE_KEY) {
  console.error("INTERNAL_SERVICE_SECRET is required via --internal-key or env");
  process.exit(2);
}

if (!TODO_DATABASE_URL) {
  console.error("TODO_DATABASE_URL must be set in env for DB access");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: TODO_DATABASE_URL });

async function fetchWorkspacesForUser(userId) {
  const url = `${ACCOUNT_SERVICE_URL.replace(/\/$/,"")}/internal/v1/accounts/${encodeURIComponent(userId)}/workspaces`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      "x-internal-service-key": INTERNAL_SERVICE_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`Account service returned ${res.status} for ${userId}`);
  }

  return res.json(); // { workspaces: [...] }
}

async function run() {
  const client = await pool.connect();
  try {
    // Verify workspace_id column exists
    const colRes = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'todos' AND column_name = 'workspace_id'
    `);

    if (colRes.rowCount === 0) {
      console.error("workspace_id column not found on todos table. Run migration first.");
      process.exit(2);
    }

    const todosRes = await client.query(
      `SELECT id, owner_id FROM todos WHERE workspace_id IS NULL AND deleted_at IS NULL`
    );

    console.info(`Found ${todosRes.rowCount} todos without workspace_id`);

    const byOwner = new Map();
    for (const row of todosRes.rows) {
      const list = byOwner.get(row.owner_id) || [];
      list.push(row.id);
      byOwner.set(row.owner_id, list);
    }

    const ambiguous = [];
    const toApply = [];

    for (const [ownerId, todoIds] of byOwner.entries()) {
      try {
        const payload = await fetchWorkspacesForUser(ownerId);
        const workspaces = payload?.workspaces || [];

        if (workspaces.length === 1) {
          toApply.push({ ownerId, workspaceId: workspaces[0].id, todoIds });
        } else {
          ambiguous.push({ ownerId, todoIds, workspaces });
        }
      } catch (err) {
        console.error(`Failed to fetch workspaces for ${ownerId}: ${err.message}`);
        ambiguous.push({ ownerId, todoIds, workspaces: [], error: String(err) });
      }
    }

    console.info(`Candidates to apply: ${toApply.length}; Ambiguous: ${ambiguous.length}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const csvPath = `ambiguous-backfill-${timestamp}.csv`;
    const csvStream = fs.createWriteStream(csvPath, { encoding: "utf8" });
    csvStream.write("ownerId,todoCount,workspaceCount,workspaceIds,error\n");
    for (const a of ambiguous) {
      const ids = (a.workspaces || []).map((w) => w.id).join("|");
      csvStream.write(`${a.ownerId},${a.todoIds.length},${(a.workspaces||[]).length},"${ids}","${a.error||""}"\n`);
    }
    csvStream.end();

    if (!hasApply) {
      console.info("Dry-run complete. Rerun with --apply to perform updates. Ambiguous cases written to:", csvPath);
      return;
    }

    console.info("Applying updates...");

    for (const entry of toApply) {
      const res = await client.query(
        `UPDATE todos SET workspace_id = $1 WHERE owner_id = $2 AND workspace_id IS NULL AND deleted_at IS NULL RETURNING id`,
        [entry.workspaceId, entry.ownerId],
      );

      console.info(`Updated ${res.rowCount} todos for owner ${entry.ownerId} -> workspace ${entry.workspaceId}`);
    }

    console.info("Backfill apply complete. Ambiguous cases written to:", csvPath);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
