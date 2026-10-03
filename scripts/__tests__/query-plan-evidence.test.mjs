import assert from "node:assert/strict";
import test from "node:test";
import { summarizePlan } from "../query-plan-evidence.mjs";

const node = { "Node Type": "Index Scan", "Index Name": "production_index", "Plan Rows": 21,
  "Actual Rows": 21, "Actual Loops": 1, "Actual Total Time": 1,
  "Shared Hit Blocks": 4, "Shared Read Blocks": 2 };

test("summarizes executed plans including nested index and filter evidence", () => {
  const summary = summarizePlan({ "Planning Time": 0.5, "Execution Time": 2,
    Plan: { ...node, "Node Type": "Limit", "Index Name": undefined, Plans: [
      { ...node, "Rows Removed by Filter": 10 },
    ] } });
  assert.equal(summary.rows, 21);
  assert.deepEqual(summary.indexes, ["production_index"]);
  assert.equal(summary.nodes[1].removedByFilter, 10);
  assert.equal(summary.sharedReadBlocks, 2);
});

test("rejects estimated-only plans and missing actual execution/buffer evidence", () => {
  assert.throws(() => summarizePlan({ Plan: node }), /Planning Time/);
  for (const field of ["Actual Rows", "Actual Loops", "Actual Total Time", "Shared Hit Blocks", "Shared Read Blocks"]) {
    assert.throws(() => summarizePlan({ "Planning Time": 1, "Execution Time": 1,
      Plan: { ...node, [field]: undefined } }), /executed-node/);
  }
});
