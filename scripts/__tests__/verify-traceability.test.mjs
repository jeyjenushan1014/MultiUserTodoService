import assert from "node:assert/strict";
import test from "node:test";
import { requestedRequirementIds, validateTraceability } from "../verify-traceability.mjs";

const fixture = () => requestedRequirementIds.map((id) => {
  const uncovered = id === "PR-8" || id === "TRC-3" || id === "TRC-4";
  return `| ${id} | ${uncovered ? "Uncovered" : "Partial"} | ${uncovered ? "—" : "\`npm run test\`"} | Explicit evidence or gap. |`;
}).join("\n");

test("requires one exact status row and executable command for each requested identifier", () => {
  const result = validateTraceability(`## Exact requirement-level status matrix\n${fixture()}`, { scripts: { test: "node --test" } });
  assert.equal(result.requirements, requestedRequirementIds.length);
  assert.equal(result.mapped, requestedRequirementIds.length);
});

test("rejects missing, duplicate, and unknown-check rows", () => {
  const rows = `## Exact requirement-level status matrix\n${fixture()}`;
  assert.throws(() => validateTraceability(rows.replace(/^.*\| DOC-10 \|.*\n/m, ""), {
    scripts: { test: "node --test" },
  }), /DOC-10 must have exactly one row/);
  assert.throws(() => validateTraceability(`${rows}\n${rows.split("\n")[1]}`, {
    scripts: { test: "node --test" },
  }), /must have exactly one row/);
  assert.throws(() => validateTraceability(rows.replace("`npm run test`", "`npm run missing`"), {
    scripts: { test: "node --test" },
  }), /must name one executable root npm script/);
});

test("an uncovered requirement cannot claim an executable check", () => {
  const rows = `## Exact requirement-level status matrix\n${fixture()}`.replace("| PR-8 | Uncovered | — |", "| PR-8 | Uncovered | `npm run test` |");
  assert.throws(() => validateTraceability(rows, { scripts: { test: "node --test" } }),
    /PR-8 is Uncovered but lists a check/);
});
