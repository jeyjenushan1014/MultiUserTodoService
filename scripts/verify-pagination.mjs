import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { runner } from "node-pg-migrate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
assert.ok(process.env.PF2_DATABASE_URL, "PF2_DATABASE_URL must point to a dedicated PostgreSQL cluster with CREATEDB permission");
const admin = new pg.Client({ connectionString: process.env.PF2_DATABASE_URL, connectionTimeoutMillis: 5000 });
const databaseName = `pf2_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.PF2_DATABASE_URL);
url.pathname = `/${databaseName}`;
const directory = await mkdtemp(join(tmpdir(), "todo-pf2-"));
let pool;
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const migrations = [
    "1789992000001_create_todo_owners.cjs",
    "1789992000002_create_todos.cjs",
    "1790121600000_add_durable_todo_cache_version.cjs",
    "20260923173000_create_todo_shares.cjs",
    "20260924120000_add_email_to_todo_owners.cjs",
    "20261003123000_add_todo_optimistic_version.cjs",
  ];
  for (const migration of migrations) {
    await copyFile(join(root, "apps", "todo-service", "migrations", migration), join(directory, migration));
  }
  await runner({
    databaseUrl: url.href, dir: directory, direction: "up",
    migrationsTable: "pgmigrations", count: 2, log: () => undefined,
  });
  Object.assign(process.env, {
    DOTENV_CONFIG_QUIET: "true",
    NODE_ENV: "test", TODO_DATABASE_URL: url.href,
    REDIS_URL: "redis://127.0.0.1:1", RABBITMQ_URL: "amqp://127.0.0.1:1",
    INTERNAL_SERVICE_SECRET: "pagination-verification-only-secret-000000000000000000000000",
    CHAIN_WRITER_ADDRESS: "0x1111111111111111111111111111111111111111",
    TASK_HISTORY_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
    CHAIN_RPC_URL: "http://127.0.0.1:1", CHAIN_ID: "31337",
  });
  const { PostgresListTodosRepository } = await import(pathToFileURL(join(root,
    "apps", "todo-service", "dist", "src", "modules", "todo", "list", "postgres-list-todos.repository.js")));
  pool = new pg.Pool({ connectionString: url.href, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 60000 });
  const owner = randomUUID();
  const other = randomUUID();
  await pool.query("INSERT INTO todo_owners(id,account_created_at) VALUES($1,now()),($2,now())", [owner, other]);
  await pool.query(`
    INSERT INTO todos(id,owner_id,title,state,created_at,updated_at)
    SELECT gen_random_uuid(), CASE WHEN n <= 50000 THEN $1::uuid ELSE $2::uuid END,
      'Task ' || n, (ARRAY['pending','in_progress','completed','cancelled'])[n % 4 + 1],
      '2026-01-01'::timestamptz + (n / 2) * interval '1 microsecond',
      '2026-01-01'::timestamptz + (n / 2) * interval '1 microsecond'
    FROM generate_series(1,100000) n`, [owner, other]);
  await runner({
    databaseUrl: url.href, dir: directory, direction: "up",
    migrationsTable: "pgmigrations", log: () => undefined,
  });
  await pool.query("UPDATE todo_owners SET email=CASE WHEN id=$1 THEN 'pf2@example.invalid' ELSE 'other@example.invalid' END", [owner]);
  await pool.query(`
    INSERT INTO todo_shares(id,todo_id,owner_id,recipient_id,created_by_request_id)
    SELECT gen_random_uuid(),id,owner_id,$1,gen_random_uuid() FROM todos WHERE owner_id=$2`,
  [owner, other]);
  await pool.query("ANALYZE todos");
  await pool.query("ANALYZE todo_owners");
  await pool.query("ANALYZE todo_shares");
  const repository = new PostgresListTodosRepository(pool);
  const base = { ownerId: owner, page: 1, pageSize: 20, access: "owned", sortBy: "createdAt", sortOrder: "desc" };
  const first = await repository.listTodos(base);
  assert.equal(first.totalItems, 50000);
  assert.ok(first.nextCursor);
  for (const sortOrder of ["asc", "desc"]) {
    const expected = (await pool.query(`SELECT id FROM todos WHERE owner_id=$1 ORDER BY created_at ${sortOrder}, id ${sortOrder} LIMIT 200`, [owner])).rows.map((row) => row.id);
    const actual = [];
    let cursor;
    for (let page = 0; page < 10; page++) {
      const result = await repository.listTodos({ ...base, sortOrder, ...(cursor ? { cursor } : {}) });
      actual.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      assert.ok(cursor);
    }
    assert.deepEqual(actual, expected, "Cursor traversal must preserve tied microsecond timestamps without gaps/duplicates");
  }
  const boundary = (await pool.query(`
    SELECT id, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
    FROM todos WHERE owner_id=$1 ORDER BY created_at DESC,id DESC OFFSET 44999 LIMIT 1`, [owner])).rows[0];
  const deepCursor = Buffer.from(JSON.stringify({ ...boundary, sortOrder: "desc" })).toString("base64url");
  const expectedDeep = (await pool.query("SELECT id FROM todos WHERE owner_id=$1 ORDER BY created_at DESC,id DESC OFFSET 45000 LIMIT 20", [owner])).rows.map((row) => row.id);
  assert.deepEqual((await repository.listTodos({ ...base, cursor: deepCursor })).items.map((item) => item.id), expectedDeep);
  const end = (await pool.query(`
    SELECT id, to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
    FROM todos WHERE owner_id=$1 ORDER BY created_at ASC,id ASC LIMIT 1`, [owner])).rows[0];
  const endCursor = Buffer.from(JSON.stringify({ ...end, sortOrder: "desc" })).toString("base64url");
  const last = await repository.listTodos({ ...base, cursor: endCursor });
  assert.equal(last.items.length, 0);
  assert.equal(last.nextCursor, undefined);
  assert.deepEqual((await repository.listTodos({ ...base, page: 2 })).items.map((item) => item.id),
    (await pool.query("SELECT id FROM todos WHERE owner_id=$1 ORDER BY created_at DESC,id DESC OFFSET 20 LIMIT 20", [owner])).rows.map((row) => row.id));
  const p95 = (samples) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
  const cases = [];
  for (const access of ["owned", "shared", "all"]) {
    for (const state of [undefined, "pending", "in_progress", "completed", "cancelled"]) {
      for (const sortOrder of ["asc", "desc"]) {
        // Independent expected IDs use a set union, not the repository's correlated EXISTS.
        const allowed = access === "owned"
          ? "SELECT id FROM todos WHERE owner_id=$1"
          : access === "shared"
            ? "SELECT todo_id AS id FROM todo_shares WHERE recipient_id=$1 AND withdrawn_at IS NULL"
            : "SELECT id FROM todos WHERE owner_id=$1 UNION SELECT todo_id AS id FROM todo_shares WHERE recipient_id=$1 AND withdrawn_at IS NULL";
        const values = state === undefined ? [owner] : [owner, state];
        const condition = state === undefined ? "" : "AND t.state=$2";
        const expected = (await pool.query(`
          SELECT t.id, to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
          FROM todos t JOIN (${allowed}) visible ON visible.id=t.id
          WHERE t.deleted_at IS NULL ${condition}
          ORDER BY t.created_at ${sortOrder},t.id ${sortOrder}`, values)).rows;
        const query = { ...base, access, sortOrder, ...(state === undefined ? {} : { state }) };
        const firstPage = await repository.listTodos(query);
        assert.equal(firstPage.totalItems, expected.length);
        assert.deepEqual(firstPage.items.map((item) => item.id), expected.slice(0, 20).map((row) => row.id));
        if (!expected.length) {
          assert.equal(firstPage.nextCursor, undefined);
          cases.push({ access, state: state ?? "unfiltered", sortOrder, eligible: 0, emptyResultVerified: true });
          continue;
        }
        const depth = Math.floor(expected.length * 0.9);
        const position = expected[depth - 1];
        const cursor = Buffer.from(JSON.stringify({ ...position, sortOrder })).toString("base64url");
        const deepPage = await repository.listTodos({ ...query, cursor });
        assert.deepEqual(deepPage.items.map((item) => item.id), expected.slice(depth, depth + 20).map((row) => row.id));
        const next = await repository.listTodos({ ...query, cursor: firstPage.nextCursor });
        assert.deepEqual(next.items.map((item) => item.id), expected.slice(20, 40).map((row) => row.id));
        const elapsed = { first: [], deep: [] };
        for (let run = 0; run < 55; run++) {
          for (const kind of run % 2 === 0 ? ["first", "deep"] : ["deep", "first"]) {
            const start = performance.now();
            await repository.listTodos({ ...query, ...(kind === "deep" ? { cursor } : {}) });
            if (run >= 5) elapsed[kind].push(performance.now() - start);
          }
        }
        const firstP95Ms = p95(elapsed.first);
        const deepP95Ms = p95(elapsed.deep);
        const limitMs = firstP95Ms * 2 + 20;
        const result = { access, state: state ?? "unfiltered", sortOrder, eligible: expected.length, depth,
          firstP95Ms, deepP95Ms, limitMs, passed: deepP95Ms <= limitMs };
        cases.push(result);
        console.error(JSON.stringify(result));
        assert.ok(result.passed, `Deep-page latency exceeded the fixed PF-2 threshold: ${access}/${state ?? "unfiltered"}/${sortOrder}`);
      }
    }
  }
  console.log(JSON.stringify({
    check: "PF-2", date: new Date().toISOString(), dataset: 100000, ownerTasks: 50000,
    activeShares: 50000, pageSize: 20, samples: 50, cache: "bypassed; production PostgreSQL repository",
    threshold: "deep p95 <= first p95 * 2 + 20ms", cases, passed: true,
  }, null, 2));
} finally {
  if (pool) await pool.end();
  if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
