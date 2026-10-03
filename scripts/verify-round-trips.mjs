import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { encodeIdentity, signIdentity } from "@todo/common";
import { requirePerformanceIsolation } from "./performance/isolation.mjs";

requirePerformanceIsolation();
process.env.DOTENV_CONFIG_QUIET = "true";
const load = (path) => import(pathToFileURL(resolve("apps", "todo-service", "dist", "src", path)));
const { database } = await load("config/database.js");
const { cache, connectCache } = await load("config/cache.js");
let collecting = false;
let statements = [];
// Instrument the actual pg client; all queries still execute against PostgreSQL.
database.on("connect", (client) => {
  const original = client.query;
  client.query = function (...args) {
    if (collecting) statements.push(typeof args[0] === "string" ? args[0] : args[0].text);
    return original.apply(this, args);
  };
});
const owner = randomUUID();
const other = randomUUID();
let server;
try {
  await connectCache();
  await database.query("INSERT INTO todo_owners(id,account_created_at,email,projection_occurred_at) VALUES($1,now(),$3,now()),($2,now(),$4,now())",
    [owner, other, `${owner}@example.invalid`, `${other}@example.invalid`]);
  await database.query(`
    INSERT INTO todos(id,owner_id,title) SELECT gen_random_uuid(),$1,'round-trip-'||n
    FROM generate_series(1,120) n`, [owner]);
  await database.query(`
    INSERT INTO todo_shares(id,todo_id,owner_id,recipient_id,created_by_request_id)
    SELECT gen_random_uuid(),id,owner_id,$1,gen_random_uuid() FROM todos WHERE owner_id=$2`, [other, owner]);
  const { app } = await load("app.js");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const cases = [];
  const call = async (caller, access, pageSize) => {
    const requestId = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const identity = encodeIdentity({ issuer: "gateway", audience: "todo-service", requestId,
      issuedAt, expiresAt: issuedAt + 30, userId: caller, sessionId: randomUUID(),
      email: `${caller}@example.invalid`, accessTokenIssuedAt: issuedAt });
    statements = [];
    collecting = true;
    let response;
    let body;
    try {
      response = await fetch(`http://127.0.0.1:${port}/internal/v1/todos?access=${access}&pageSize=${pageSize}`, {
        headers: { "x-request-id": requestId, "x-internal-identity": identity,
          "x-internal-signature": signIdentity(identity, process.env.INTERNAL_SERVICE_SECRET) },
        signal: AbortSignal.timeout(10000),
      });
      body = await response.json();
    } finally {
      collecting = false;
    }
    assert.equal(response.status, 200);
    assert.equal(body.items.length, pageSize);
    assert.equal(body.pagination.totalItems, 120);
    return { calls: statements.length, sqlKinds: statements.map((sql) => sql.trim().split(/\s+/)[0]), items: pageSize };
  };
  for (const size of [1, 20, 100]) {
    for (const access of ["all", "shared"]) {
      const result = await call(access === "shared" ? other : owner, access, size);
      assert.equal(result.calls, 4, "Cache-bypass list endpoint must execute BEGIN/COUNT/SELECT/COMMIT");
      assert.deepEqual(result.sqlKinds, ["BEGIN", "SELECT", "SELECT", "COMMIT"]);
      cases.push({ access, ...result });
    }
    const miss = await call(owner, "owned", size);
    assert.equal(miss.calls, 5, "Owned miss includes one durable cache-version query plus four list queries");
    const hit = await call(owner, "owned", size);
    assert.equal(hit.calls, 1, "Owned cache hit must still verify the durable PostgreSQL version");
    cases.push({ access: "owned-miss", ...miss }, { access: "owned-hit", ...hit });
  }
  console.log(JSON.stringify({ requirement: "PF-3", date: new Date().toISOString(),
    endpoint: "GET /internal/v1/todos (actual production Express app and signed identity middleware)",
    database: "real PostgreSQL; pg client query calls including transaction control",
    tasks: 120, cases, passed: true }));
} finally {
  if (server) await new Promise((done, reject) => server.close((error) => error ? reject(error) : done()));
  if (cache.isOpen) await cache.quit();
  await database.end();
}
