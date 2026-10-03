import assert from "node:assert/strict";

export function summarizePlan(explain) {
  assert.ok(explain?.Plan, "EXPLAIN must include an executed root plan");
  for (const field of ["Planning Time", "Execution Time"]) {
    assert.ok(Number.isFinite(explain[field]) && explain[field] >= 0, `Missing ${field}`);
  }
  const nodes = [];
  const visit = (node) => {
    for (const field of ["Actual Rows", "Actual Loops", "Actual Total Time", "Shared Hit Blocks", "Shared Read Blocks"]) {
      assert.ok(Number.isFinite(node[field]) && node[field] >= 0, `Missing executed-node ${field}`);
    }
    nodes.push({
      type: node["Node Type"], relation: node["Relation Name"], index: node["Index Name"],
      estimatedRows: node["Plan Rows"], actualRows: node["Actual Rows"], loops: node["Actual Loops"],
      removedByFilter: node["Rows Removed by Filter"] ?? 0,
      sortMethod: node["Sort Method"], sortSpaceType: node["Sort Space Type"],
    });
    for (const child of node.Plans ?? []) visit(child);
  };
  visit(explain.Plan);
  return {
    planningMs: explain["Planning Time"], executionMs: explain["Execution Time"],
    rows: explain.Plan["Actual Rows"],
    sharedHitBlocks: explain.Plan["Shared Hit Blocks"], sharedReadBlocks: explain.Plan["Shared Read Blocks"],
    tempReadBlocks: explain.Plan["Temp Read Blocks"] ?? 0,
    tempWrittenBlocks: explain.Plan["Temp Written Blocks"] ?? 0,
    indexes: [...new Set(nodes.map((node) => node.index).filter(Boolean))],
    sequentialScans: nodes.filter((node) => node.type === "Seq Scan").map((node) => node.relation),
    nodes,
  };
}
