import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { verifyEvolutionSchema } from "../evolution/verify-postgres.mjs";

test("schema verifier fails closed without a dedicated PostgreSQL URL", async () => {
  await assert.rejects(verifyEvolutionSchema({ connectionString: "" }), /EV_DATABASE_URL/);
  const env = { ...process.env };
  delete env.EV_DATABASE_URL;
  const result = spawnSync(process.execPath, [resolve("scripts/verify-evolution-schema.mjs")], {
    encoding: "utf8", env, timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^FAIL: schema evolution verification/);
});

test("connection failures are nonzero and never print connection secrets", () => {
  const secret = "evolution-negative-case-secret";
  const result = spawnSync(process.execPath, [resolve("scripts/verify-evolution-schema.mjs")], {
    encoding: "utf8",
    env: { ...process.env, EV_DATABASE_URL: `postgres://verification:${secret}@127.0.0.1:1/postgres` },
    timeout: 15000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^FAIL: schema evolution verification/);
  assert.equal(result.stderr.includes(secret), false);
  assert.equal(result.stderr.includes("postgres://"), false);
});
