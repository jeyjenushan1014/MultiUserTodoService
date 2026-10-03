import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runner } from "node-pg-migrate";
import { previousGetTodoRepository, previousRevision } from "./previous-get-todo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const additiveMigration = "20260925170000_add_workspace_id_to_todos";
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const operatorRoles = [
  "account_routine_operator", "account_break_glass_operator", "account_operator_auditor",
  "todo_routine_operator", "todo_break_glass_operator", "todo_operator_auditor",
];

async function schema(client) {
  const { rows } = await client.query(`
    SELECT 'column' AS kind, table_name || '.' || column_name AS name,
      concat_ws('|', data_type, udt_name, character_maximum_length, is_nullable, column_default) AS definition
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name <> 'pgmigrations'
    UNION ALL
    SELECT 'index', indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename <> 'pgmigrations'
    UNION ALL
    SELECT 'constraint', c.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname <> 'pgmigrations'
    UNION ALL
    SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f'
    UNION ALL
    SELECT 'trigger', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY kind, name, definition`);
  return rows;
}

async function rowsFor(client, table) {
  if (!(await client.query("SELECT to_regclass($1) AS relation", [`public.${table}`])).rows[0].relation) return [];
  return (await client.query(`SELECT to_jsonb(t) AS data FROM "${table}" t ORDER BY id`)).rows.map((row) => row.data);
}

async function preservedRows(client, before, allowDroppedTables = true, allowedChanges = new Set()) {
  for (const [table, rows] of Object.entries(before)) {
    const after = await rowsFor(client, table);
    if (!after.length) {
      const exists = (await client.query("SELECT to_regclass($1) AS relation", [`public.${table}`])).rows[0].relation;
      assert.ok(allowDroppedTables, `Upgrade removed ${table} data`);
      assert.equal(exists, null, `Rollback unexpectedly erased surviving ${table} data`);
      continue; // Foundational DROP TABLE deliberately removes its data.
    }
    assert.equal(after.length, rows.length, `Rollback changed ${table} row count`);
    for (let i = 0; i < rows.length; i++) {
      for (const key of Object.keys(after[i])) {
        if (Object.hasOwn(rows[i], key) && !allowedChanges.has(`${table}.${key}`)) {
          assert.deepEqual(after[i][key], rows[i][key], `${table}.${key} unexpectedly changed`);
        }
      }
    }
  }
}

async function seed(client, service, migration, ids) {
  if (service === "account" && migration === "001_create_users") {
    await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,'evolution@example.invalid','synthetic-verification-hash')", [ids.owner]);
  }
  if (service === "todo" && migration.endsWith("_create_todo_owners")) {
    await client.query("INSERT INTO todo_owners(id,account_created_at) VALUES($1,CURRENT_TIMESTAMP)", [ids.owner]);
  }
  if (service === "todo" && migration.endsWith("_create_todos")) {
    await client.query("INSERT INTO todos(id,owner_id,title,description) VALUES($1,$2,'Previous release task','Preserve this record')", [ids.todo, ids.owner]);
  }
  if (service === "todo" && migration.endsWith("_add_email_to_todo_owners")) {
    await client.query("UPDATE todo_owners SET email='evolution@example.invalid' WHERE id=$1", [ids.owner]);
  }
}

async function onlineMigration(pool, migrate, ids) {
  const repository = previousGetTodoRepository(pool);
  const expected = await repository.findAccessibleById({ todoId: ids.todo, callerId: ids.owner });
  assert.equal(expected.title, "Previous release task");
  const server = createServer(async (_request, response) => {
    try {
      const value = await repository.findAccessibleById({ todoId: ids.todo, callerId: ids.owner });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/todos/${ids.todo}`;
  let stop = false;
  let trafficError;
  let requests = 0;
  let during = 0;
  let phase = "before";
  const request = async () => {
    const startedPhase = phase;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, "Previous HTTP repository request failed");
    assert.deepEqual(await response.json(), expected);
    requests++;
    if (startedPhase === "during") during++;
  };
  let traffic;
  let blocker;
  let pending;
  let overlapping;
  try {
    await request();
    traffic = (async () => {
      while (!stop) {
        try { await request(); } catch (error) { trafficError = error; return; }
      }
    })();
    // A real reader's ACCESS SHARE lock keeps the actual ALTER TABLE pending long
    // enough to prove overlap. Previous-code queries queue behind DDL and must resume.
    blocker = await pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM todos WHERE id=$1", [ids.todo]);
    phase = "during";
    pending = migrate();
    // Attach rejection immediately; a migration failure must not be unhandled.
    pending.catch(() => {});
    let observedLock = false;
    for (let i = 0; i < 100; i++) {
      const result = await pool.query(`SELECT EXISTS (
        SELECT 1 FROM pg_locks
        WHERE relation='todos'::regclass AND mode='AccessExclusiveLock' AND NOT granted
      ) AS waiting`);
      if (result.rows[0].waiting) { observedLock = true; break; }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    assert.equal(observedLock, true, "Real production ALTER TABLE was not observed pending");
    overlapping = request();
    overlapping.catch(() => {});
    let observedPreviousReader = false;
    for (let i = 0; i < 100; i++) {
      const result = await pool.query(`SELECT EXISTS (
        SELECT 1 FROM pg_locks
        WHERE relation='todos'::regclass AND mode='AccessShareLock' AND NOT granted
      ) AS waiting`);
      if (result.rows[0].waiting) { observedPreviousReader = true; break; }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    assert.equal(observedPreviousReader, true, "Previous repository SQL did not overlap pending production DDL");
    await blocker.query("COMMIT");
    blocker.release();
    blocker = undefined;
    await pending;
    await overlapping;
    // Drain the request which began while migration was pending, before changing phase.
    for (let i = 0; during === 0 && !trafficError && i < 100; i++) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    assert.ok(during > 0, "No successful previous-code HTTP traffic overlapped migration");
    phase = "after";
    await request();
    stop = true;
    await traffic;
    if (trafficError) throw trafficError;
    assert.ok((await schema(pool)).some((column) => column.name === "todos.workspace_id"));
    return { revision: previousRevision, beforeDuringAfterRequests: requests, overlappingRequests: during,
      pendingAccessExclusiveLockObserved: true, previousRepositorySqlWaitingDuringDdlObserved: true,
      migration: additiveMigration };
  } finally {
    if (blocker) { await blocker.query("ROLLBACK"); blocker.release(); }
    if (pending) await pending.catch(() => {});
    if (overlapping) await overlapping.catch(() => {});
    stop = true;
    if (traffic) await traffic;
    await new Promise((done) => server.close(done));
  }
}

export async function verifyEvolutionSchema({ connectionString = process.env.EV_DATABASE_URL, log = () => {} } = {}) {
  assert.ok(connectionString, "EV_DATABASE_URL must target a dedicated empty verification PostgreSQL cluster");
  const admin = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  const created = [];
  let isolated = false;
  let stage = "dedicated-cluster-preflight";
  const result = { services: [], online: undefined, guardedRollbackRefusal: undefined, limits: [
    "Previous-release GET repository behind a verification HTTP adapter, not the full authenticated application.",
    "One actual additive workspace migration with overlapping reads; DDL takes a brief exclusive lock, not zero-lock/zero-latency proof.",
    "Seeded core user/owner/todo rows survive rollback of surviving columns; dropping their foundational tables intentionally destroys them.",
    "Migration 014 refuses rollback with workflow rows; empty rollback then succeeds. Not universally lossless for arbitrary new-feature data.",
  ] };
  try {
    await admin.connect();
    // Serialize this verifier's cluster-global role migrations, even when CLI and
    // the integration test are invoked concurrently against the dedicated service.
    assert.equal((await admin.query("SELECT pg_try_advisory_lock(1791014400) AS locked")).rows[0].locked, true,
      "Another schema verifier owns this dedicated PostgreSQL cluster");
    const roles = await admin.query("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [operatorRoles]);
    assert.equal(roles.rowCount, 0, "Cluster already has application operator roles; use dedicated evolution PostgreSQL");
    const tables = await admin.query(`SELECT tablename FROM pg_tables
      WHERE schemaname='public' AND tablename IN ('users','todos','todo_owners','pgmigrations')`);
    assert.equal(tables.rowCount, 0, "Never use an application database for evolution verification");
    isolated = true;
    for (const service of ["account", "todo"]) {
      const name = `ev_${service}_${randomUUID().replaceAll("-", "")}`;
      const url = new URL(connectionString);
      url.pathname = `/${name}`;
      stage = `${service}:create-disposable-database`;
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
      created.push(name);
      const pool = new pg.Pool({ connectionString: url.href, max: 8, connectionTimeoutMillis: 5000,
        statement_timeout: 10000, query_timeout: 15000 });
      try {
        const dir = resolve(root, `apps/${service}-service/migrations`);
        const files = (await readdir(dir)).filter((file) => file.endsWith(".cjs"));
        assert.ok(files.length > 0, `No ${service} migrations discovered`);
        const before = [];
        const applied = [];
        const ids = { owner: randomUUID(), todo: randomUUID() };
        const migrate = (direction) => runner({
          databaseUrl: url.href, dir, direction, count: 1, migrationsTable: "pgmigrations",
          checkOrder: true, log: () => {}, logger: quiet,
        });
        for (let i = 0; i < files.length; i++) {
          before.push(await schema(pool));
          const coreData = {};
          for (const table of service === "account" ? ["users"] : ["todo_owners", "todos"]) {
            const rows = await rowsFor(pool, table);
            if (rows.length) coreData[table] = rows;
          }
          stage = `${service}:up:${i + 1}`;
          const next = await pool.query("SELECT to_regclass('public.pgmigrations') AS relation");
          const completed = next.rows[0].relation
            ? (await pool.query("SELECT name FROM pgmigrations")).rows.map((row) => row.name) : [];
          // Runner determines authoritative ordering, including duplicate numeric prefixes.
          const up = async () => {
            const changes = await migrate("up");
            assert.equal(changes.length, 1, "Expected exactly one real up migration");
            return changes[0].name;
          };
          const onlineNext = service === "todo" && !completed.includes(additiveMigration) &&
            files.filter((file) => !completed.includes(file.slice(0, -4))).sort()[0]?.slice(0, -4) === additiveMigration;
          let migration;
          if (onlineNext) {
            result.online = await onlineMigration(pool, async () => { migration = await up(); }, ids);
            assert.equal(migration, additiveMigration);
          } else migration = await up();
          applied.push(migration);
          // PF-6 deliberately invalidates durable owner caches during its upgrade.
          // All core business fields and every rollback comparison remain exact.
          const allowedChanges = new Set(migration.endsWith("_add_todo_optimistic_version")
            ? ["todo_owners.cache_version"] : []);
          await preservedRows(pool, coreData, false, allowedChanges);
          await seed(pool, service, migration, ids);
          log(`${service} up ${migration}`);
        }
        assert.equal(new Set(applied).size, files.length);
        for (let i = applied.length - 1; i >= 0; i--) {
          stage = `${service}:down:${applied[i]}`;
          if (service === "account" && applied[i] === "014_upgrade_account_deletion_workflow_schema") {
            const workflowId = randomUUID();
            await pool.query(`INSERT INTO account_deletion_requests(id,user_id,identity_hash)
              VALUES($1,$2,'evolution-workflow-identity')`, [workflowId, ids.owner]);
            const workflow = await pool.query("SELECT to_jsonb(w) AS data FROM account_deletion_requests w WHERE id=$1", [workflowId]);
            await assert.rejects(migrate("down"), (error) => error.code === "P0001",
              "Guarded production rollback must refuse populated deletion workflow state");
            assert.deepEqual(
              (await pool.query("SELECT to_jsonb(w) AS data FROM account_deletion_requests w WHERE id=$1", [workflowId])).rows,
              workflow.rows,
            );
            assert.equal((await pool.query("SELECT count(*)::int AS count FROM pgmigrations WHERE name=$1", [applied[i]])).rows[0].count, 1);
            await pool.query("DELETE FROM account_deletion_requests WHERE id=$1", [workflowId]);
            result.guardedRollbackRefusal = { migration: applied[i], sqlState: "P0001", workflowRowPreserved: true };
          }
          const data = {};
          for (const table of service === "account" ? ["users"] : ["todo_owners", "todos"]) {
            const rows = await rowsFor(pool, table);
            if (rows.length) data[table] = rows;
          }
          const changes = await migrate("down");
          assert.equal(changes.length, 1);
          assert.equal(changes[0].name, applied[i]);
          assert.deepEqual(await schema(pool), before[i], `Schema rollback mismatch: ${applied[i]}`);
          await preservedRows(pool, data);
          // Frozen old code must still read the same task after removing workspace_id.
          if (applied[i] === additiveMigration) {
            const todo = await previousGetTodoRepository(pool).findAccessibleById({ todoId: ids.todo, callerId: ids.owner });
            assert.equal(todo.title, "Previous release task");
          }
          log(`${service} down ${applied[i]}`);
        }
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM pgmigrations")).rows[0].count, 0);
        result.services.push({ service, up: applied, down: [...applied].reverse(), coreRowsPreservedOnApplicableRollback: true });
      } finally { await pool.end(); }
    }
    assert.ok(result.online, "Additive production migration compatibility check did not run");
    stage = "operator-role-cleanup-check";
    assert.equal((await admin.query("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [operatorRoles])).rowCount, 0);
    return result;
  } catch (error) {
    error.stage = stage;
    throw error;
  } finally {
    // Names are generated by this invocation only; no caller-selected database is dropped.
    try {
      for (const name of created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      // A failed migration sequence can leave cluster-global roles behind. These
      // names were proven absent before this invocation created any database.
      if (isolated) {
        for (const role of operatorRoles) await admin.query(`DROP ROLE IF EXISTS "${role}"`);
      }
    } finally { await admin.end(); }
  }
}
