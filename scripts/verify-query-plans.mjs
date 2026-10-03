import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { runner } from "node-pg-migrate";
import { summarizePlan } from "./query-plan-evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const adminUrl = new URL(process.env.EV_DATABASE_URL ?? "http://missing");
assert.ok(process.env.QUERY_PLAN_VERIFY_ISOLATED === "1" &&
  adminUrl.hostname === "evolution-postgres" && adminUrl.pathname === "/postgres",
"Query-plan evidence must run on the dedicated isolated verification cluster");
const admin = new pg.Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 5000 });
const name = `pf10_${randomUUID().replaceAll("-", "")}`;
const url = new URL(adminUrl);
url.pathname = `/${name}`;
let created = false;
let pool;
let applicationPool;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const migrationDir = join(root, "apps", "todo-service", "migrations");
  const migrations = (await readdir(migrationDir)).filter((file) => file.endsWith(".cjs")).sort();
  await runner({ databaseUrl: url.href, dir: migrationDir, direction: "up",
    migrationsTable: "pgmigrations", log: () => undefined });
  Object.assign(process.env, { NODE_ENV: "test", DOTENV_CONFIG_QUIET: "true", TODO_DATABASE_URL: url.href });
  const repositoryPath = join(root, "apps", "todo-service", "dist", "src", "modules", "todo",
    "list", "postgres-list-todos.repository.js");
  const { PostgresListTodosRepository } = await import(pathToFileURL(repositoryPath));
  const config = await import(pathToFileURL(join(root, "apps", "todo-service", "dist", "src", "config", "database.js")));
  applicationPool = config.database;
  pool = new pg.Pool({ connectionString: url.href, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
  const owner = randomUUID();
  const other = randomUUID();
  await pool.query(`INSERT INTO todo_owners(id,account_created_at,email,projection_occurred_at)
    VALUES($1,now(),'owner@example.invalid',now()),($2,now(),'other@example.invalid',now())`, [owner, other]);
  for (let start = 1; start <= 100000; start += 5000) {
    await pool.query(`
    INSERT INTO todos(id,owner_id,title,state,due_date,created_at,updated_at,deleted_at)
    SELECT gen_random_uuid(),CASE WHEN n<=50000 THEN $1::uuid ELSE $2::uuid END,
      'PF10 task '||n,(ARRAY['pending','in_progress','completed','cancelled'])[n%4+1],
      CASE WHEN n%5=0 THEN NULL ELSE '2026-01-01'::timestamptz + (n%1000)*interval '1 day' END,
      '2026-01-01'::timestamptz + (n/2)*interval '1 microsecond',
      '2026-01-02'::timestamptz,CASE WHEN n%100=0 THEN '2026-01-02'::timestamptz ELSE NULL END
    FROM generate_series($3::int,$4::int) n`, [owner, other, start, start + 4999]);
  }
  await pool.query(`INSERT INTO todo_shares(id,todo_id,owner_id,recipient_id,created_by_request_id)
    SELECT gen_random_uuid(),id,owner_id,$1,gen_random_uuid() FROM todos WHERE owner_id=$2`, [owner, other]);
  await pool.query(`INSERT INTO todo_shares(id,todo_id,owner_id,recipient_id,created_by_request_id,shared_at,withdrawn_at)
    SELECT gen_random_uuid(),id,owner_id,$1,gen_random_uuid(),'2026-01-01','2026-01-02'
    FROM todos WHERE owner_id=$2 LIMIT 5000`, [owner, other]);
  await pool.query("VACUUM (ANALYZE) todos");
  await pool.query("VACUUM (ANALYZE) todo_shares");
  await pool.query("VACUUM (ANALYZE) todo_owners");
  const database = (await pool.query("SELECT version() AS version")).rows[0];
  const settings = (await pool.query(`SELECT name,setting,unit FROM pg_settings
    WHERE name IN ('shared_buffers','work_mem','random_page_cost','effective_cache_size','jit','max_parallel_workers_per_gather')
    ORDER BY name`)).rows;
  const indexes = (await pool.query(`SELECT tablename,indexname,indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename IN ('todos','todo_shares','todo_owners')
    ORDER BY tablename,indexname`)).rows;
  // Capture the SQL and binds emitted by the production repository, not a copied query.
  const captured = [];
  const instrumentedPool = {
    async connect() {
      const client = await pool.connect();
      return {
        query(sql, values) {
          if (/^\s*SELECT\b/i.test(sql)) captured.push({ sql, values: [...values] });
          return client.query(sql, values);
        },
        release() { client.release(); },
      };
    },
  };
  const repository = new PostgresListTodosRepository(instrumentedPool);
  const cases = [];
  for (const access of ["owned", "shared", "all"]) {
    for (const state of [undefined, "pending"]) {
      const visible = access === "owned" ? "SELECT id FROM todos WHERE owner_id=$1"
        : access === "shared" ? "SELECT todo_id AS id FROM todo_shares WHERE recipient_id=$1 AND withdrawn_at IS NULL"
          : "SELECT id FROM todos WHERE owner_id=$1 UNION SELECT todo_id AS id FROM todo_shares WHERE recipient_id=$1 AND withdrawn_at IS NULL";
      const values = state ? [owner, state] : [owner];
      const filter = state ? "AND t.state=$2" : "";
      for (const mode of ["first", "deep-keyset", "deep-dueDate-offset"]) {
        const dueDate = mode === "deep-dueDate-offset";
        const order = dueDate ? "t.due_date ASC NULLS LAST,t.created_at DESC,t.id DESC" : "t.created_at DESC,t.id DESC";
        const expected = (await pool.query(`SELECT t.id,
          to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
          FROM todos t JOIN (${visible}) v ON v.id=t.id
          WHERE t.deleted_at IS NULL ${filter} ORDER BY ${order}`, values)).rows;
        const depth = mode === "first" ? 0 : Math.floor(expected.length * 0.9 / 20) * 20;
        const parameters = { ownerId: owner, page: dueDate ? depth/20+1 : 1, pageSize: 20,
          access, sortBy: dueDate ? "dueDate" : "createdAt", sortOrder: dueDate ? "asc" : "desc",
          ...(state ? { state } : {}),
          ...(mode === "deep-keyset" ? { cursor: Buffer.from(JSON.stringify({
            ...expected[depth-1], sortOrder: "desc" })).toString("base64url") } : {}) };
        captured.length = 0;
        const result = await repository.listTodos(parameters);
        assert.equal(result.totalItems, expected.length);
        assert.deepEqual(result.items.map((item) => item.id), expected.slice(depth, depth+20).map((item) => item.id));
        assert.equal(captured.length, 2, "Must capture actual count and list SQL");
        const queries = [];
        for (const [index, query] of captured.entries()) {
          const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON) ${query.sql}`, query.values);
          const plan = rows[0]["QUERY PLAN"][0];
          const summary = summarizePlan(plan);
          assert.equal(summary.rows, index === 0 ? 1 : dueDate ? 20 : 21);
          queries.push({ kind: index === 0 ? "count" : "list", ...query,
            sqlSha256: createHash("sha256").update(query.sql).digest("hex"), summary, plan });
        }
        if (access === "owned" && !dueDate) {
          assert.ok(queries[1].summary.indexes.some((index) => index ===
            (state ? "idx_todos_owner_state_created_active" : "idx_todos_owner_created_active")),
          "Owned keyset list should use the matching production composite index");
        }
        cases.push({ access, state: state ?? "unfiltered", mode, depth, eligible: expected.length,
          expectedIdsVerified: true, queries });
      }
    }
  }
  assert.equal(cases.length, 18);
  console.log(JSON.stringify({ requirement: "PF-10", date: new Date().toISOString(),
    database, settings, indexes, migrations,
    repositorySha256: createHash("sha256").update(await readFile(repositoryPath)).digest("hex"),
    dataset: { tasks: 100000, tasksPerOwner: 50000, activeShares: 50000,
      withdrawnShares: 5000, deletedTasks: 1000 }, pageSize: 20,
    cache: "No Redis; direct production repository; warmed PostgreSQL buffers, not cold-cache latency",
    explain: "ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT JSON",
    cases, passed: true }));
} finally {
  if (pool) await pool.end();
  if (applicationPool) await applicationPool.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
