import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { objectives } from "./performance/objectives.mjs";
import { requirePerformanceIsolation } from "./performance/isolation.mjs";

requirePerformanceIsolation();
const baseUrl = process.env.TODO_E2E_BASE_URL;
const pool = new pg.Pool({ connectionString: process.env.TODO_DATABASE_URL, max: 2,
  connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const password = "VerificationPerformance123!";
const prefix = `perf-${randomUUID()}`;
const users = [];
const successfulWrites = [];
const metrics = { read: { durations: [], errors: 0, invalidResponses: 0 },
  write: { durations: [], errors: 0, invalidResponses: 0 } };
let directory;
const jsonRequest = async (path, { token, method = "GET", body, key } = {}) => {
  const response = await fetch(new URL(path, baseUrl), {
    method, headers: { "content-type": "application/json", "x-request-id": randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { "idempotency-key": key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
};
try {
  for (let n = 0; n < objectives.clients; n++) {
    const email = `${prefix}-${n}@example.invalid`;
    assert.equal((await jsonRequest("/api/v1/auth/register", { method: "POST", body: { email, password } })).status, 201);
    const login = await jsonRequest("/api/v1/auth/login", { method: "POST", body: { email, password } });
    assert.equal(login.status, 200);
    assert.ok(login.body.data?.accessToken && login.body.data?.user?.id);
    users.push({ id: login.body.data.user.id, token: login.body.data.accessToken });
  }
  const ids = users.map((user) => user.id);
  let projectionsReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const count = Number((await pool.query("SELECT count(*) FROM todo_owners WHERE id=ANY($1::uuid[])", [ids])).rows[0].count);
    if (count === ids.length) { projectionsReady = true; break; }
    await wait(500);
  }
  assert.ok(projectionsReady, "Real owner projection did not catch up");
  await pool.query(`
    INSERT INTO todos(id,owner_id,title,created_at,updated_at)
    SELECT gen_random_uuid(),owner_id,$2 || '-fixture-' || n,
      now()-interval '1 day' + n*interval '1 microsecond',now()
    FROM unnest($1::uuid[]) owner_id CROSS JOIN generate_series(1,1000) n`, [ids, prefix]);
  assert.equal(Number((await pool.query("SELECT count(*) FROM todos WHERE owner_id=ANY($1::uuid[])", [ids])).rows[0].count), 20000);
  await pool.query("ANALYZE todos");
  // Each virtual user is sequential and paced: 20 active users, at most 10 HTTP requests/s.
  const runPhase = async (durationMs, measured) => {
    const start = performance.now();
    await Promise.all(users.map(async (user, index) => {
      await wait(index * 50);
      let iteration = 0;
      while (performance.now() - start < durationMs) {
        const cycleStart = performance.now();
        const operation = (iteration + index) % 5 === 0 ? "write" : "read";
        const metric = metrics[operation];
        let elapsed;
        try {
          const title = `${prefix}-write-${index}-${randomUUID()}`;
          const result = operation === "read"
            ? await jsonRequest("/api/v1/todos?access=all&pageSize=20&sortBy=createdAt&sortOrder=desc", { token: user.token })
            : await jsonRequest("/api/v1/todos", { token: user.token, method: "POST", key: randomUUID(), body: { title } });
          elapsed = performance.now() - cycleStart;
          if (measured && result.status !== (operation === "read" ? 200 : 201)) metric.errors++;
          if (!measured) assert.equal(result.status, operation === "read" ? 200 : 201, "Warm-up HTTP failed");
          if (result.status === (operation === "read" ? 200 : 201)) {
            const valid = operation === "read"
              ? Array.isArray(result.body.items) && result.body.items.length === 20 &&
                result.body.items.every((item) => item.ownerId === user.id) &&
                result.body.pagination?.totalItems >= 1000 && typeof result.body.nextCursor === "string"
              : typeof result.body.id === "string" && result.body.ownerId === user.id &&
                result.body.title === title && result.body.version === 1;
            if (!valid && measured) metric.invalidResponses++;
            if (!valid && !measured) throw new Error("Warm-up returned invalid data");
            if (operation === "write" && valid) successfulWrites.push({ id: result.body.id, title, ownerId: user.id, measured });
          }
        } catch (error) {
          if (!measured) throw error;
          metric.errors++;
          elapsed = performance.now() - cycleStart;
          console.error(`Performance ${operation} transport failure: ${error.name}`);
        }
        if (measured) metric.durations.push(elapsed);
        iteration++;
        await wait(Math.max(0, objectives.cycleMs - (performance.now() - cycleStart)));
      }
    }));
    return performance.now() - start;
  };
  await runPhase(objectives.warmupMs, false);
  const elapsedMs = await runPhase(objectives.durationMs, true);
  const stored = (await pool.query(`
    SELECT t.id,t.title,t.owner_id,c.id AS submission_id FROM todos t
    LEFT JOIN chain_submissions c ON c.task_id=t.id AND c.action='created'
    WHERE t.id=ANY($1::uuid[])`, [successfulWrites.map((write) => write.id)])).rows;
  const indexed = new Map(stored.map((row) => [row.id, row]));
  for (const write of successfulWrites) {
    const row = indexed.get(write.id);
    if (!row || row.title !== write.title || row.owner_id !== write.ownerId || !row.submission_id) {
      if (write.measured) metrics.write.invalidResponses++;
      else throw new Error("Warm-up write was not durably persisted/enqueued");
    }
  }
  const summarize = (metric) => {
    const sorted = [...metric.durations].sort((a, b) => a - b);
    const quantile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
    return { samples: sorted.length, errors: metric.errors, invalidResponses: metric.invalidResponses,
      p50Ms: quantile(0.5), p95Ms: quantile(0.95), p99Ms: quantile(0.99),
      requestsPerSecond: sorted.length / (elapsedMs / 1000) };
  };
  const result = { requirements: ["PF-4", "PF-5"], date: new Date().toISOString(),
    clients: users.length, elapsedMs, warmupMs: objectives.warmupMs, cycleMs: objectives.cycleMs,
    dataset: { seededTasks: 20000, tasksPerCaller: 1000, users: users.length },
    endpoints: { read: "GET /api/v1/todos?access=all&pageSize=20 (Redis list cache bypass)",
      write: "POST /api/v1/todos (HTTP acceptance, PostgreSQL commit/outbox/chain enqueue, not chain finality)" },
    objectives, read: summarize(metrics.read), write: summarize(metrics.write),
    durableWritesVerified: successfulWrites.length };
  directory = await mkdtemp(join(tmpdir(), "todo-perf-"));
  const file = join(directory, "measurements.json");
  await writeFile(file, JSON.stringify(result));
  const evaluate = (negative) => spawnSync(process.execPath, [resolve("scripts/performance/evaluate.mjs"), file,
    ...(negative ? ["--deliberate-breach"] : [])], { encoding: "utf8", timeout: 10000 });
  const positive = evaluate(false);
  if (positive.status !== 0) console.error(JSON.stringify({ ...result, passed: false }));
  assert.equal(positive.status, 0, `Latency objectives failed: ${positive.stdout} ${positive.stderr}`);
  const negative = evaluate(true);
  assert.equal(negative.status, 1, "Deliberate threshold breach must exit exactly 1, not pass or crash");
  const detection = JSON.parse(negative.stdout);
  assert.ok(detection.failures.includes("read: p95 objective breached"));
  assert.ok(detection.failures.includes("write: p95 objective breached"));
  console.log(JSON.stringify({ ...result, passed: true,
    deliberateBreach: { readP95Ms: 0.001, writeP95Ms: 0.001, actualExitCode: negative.status, ...detection } }));
} finally {
  await pool.end();
  if (directory) await rm(directory, { recursive: true, force: true });
}
