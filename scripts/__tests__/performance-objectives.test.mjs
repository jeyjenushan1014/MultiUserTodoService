import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMeasurements, objectives } from "../performance/objectives.mjs";

const passing = () => ({ clients: 20, elapsedMs: 300000,
  read: { samples: 2400, p95Ms: 250, errors: 0, invalidResponses: 0 },
  write: { samples: 600, p95Ms: 400, errors: 0, invalidResponses: 0 } });

test("latency objectives use separate read/write limits", () => {
  assert.equal(evaluateMeasurements(passing()).passed, true);
  const result = passing();
  result.read.p95Ms = 301;
  assert.equal(evaluateMeasurements(result).passed, false);
});
test("rejects inadequate load, errors and invalid response even if latency passes", () => {
  for (const mutate of [
    (r) => { r.write.samples = 20; },
    (r) => { r.read.errors = 30; },
    (r) => { r.write.invalidResponses = 1; },
    (r) => { r.read.p95Ms = Number.NaN; },
    (r) => { r.elapsedMs = 10000; },
    (r) => { r.elapsedMs = Number.NaN; },
    (r) => { r.clients = 1; },
  ]) {
    const result = passing();
    mutate(result);
    assert.equal(evaluateMeasurements(result).passed, false);
  }
});
test("deliberate breach fails both operation objectives", () => {
  const result = evaluateMeasurements(passing(), { ...objectives, readP95Ms: 0.001, writeP95Ms: 0.001 });
  assert.deepEqual(result.failures, ["read: p95 objective breached", "write: p95 objective breached"]);
});
