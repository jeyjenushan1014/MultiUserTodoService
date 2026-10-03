#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const requestedRequirementIds = [
  ...Array.from({ length: 8 }, (_, index) => `PR-${index + 1}`),
  ...Array.from({ length: 3 }, (_, index) => `DOC-${index + 10}`),
  ...Array.from({ length: 5 }, (_, index) => `EVT-${index + 8}`),
  ...Array.from({ length: 4 }, (_, index) => `ARC-${index + 8}`),
  ...Array.from({ length: 4 }, (_, index) => `AUT-${index + 2}`),
  ...Array.from({ length: 7 }, (_, index) => `ONC-${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `OPS-${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `TRC-${index + 1}`),
];

export function parseTraceabilityRows(markdown) {
  const matrix = markdown.split("## Exact requirement-level status matrix")[1]?.split("\n## ")[0];
  if (!matrix) return [];
  return matrix.split(/\r?\n/)
    .filter((line) => /^\| (?:PR|DOC|EVT|ARC|AUT|ONC|OPS|TRC)-\d+ \|/.test(line))
    .map((line) => {
      const [requirement, status, check, evidence] = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return { requirement, status, check, evidence };
    });
}

export function validateTraceability(markdown, packageJson) {
  const rows = parseTraceabilityRows(markdown);
  const scripts = packageJson.scripts ?? {};
  const problems = [];
  if (rows.length !== requestedRequirementIds.length) {
    problems.push(`matrix must contain exactly ${requestedRequirementIds.length} rows; found ${rows.length}`);
  }
  for (const id of requestedRequirementIds) {
    const matches = rows.filter((row) => row.requirement === id);
    if (matches.length !== 1) {
      problems.push(`${id} must have exactly one row; found ${matches.length}`);
      continue;
    }
    const [row] = matches;
    if (!["Covered", "Partial", "Uncovered"].includes(row.status)) {
      problems.push(`${id} has an invalid status: ${row.status}`);
    }
    if (!row.evidence) problems.push(`${id} is missing its evidence/gap description`);
    const command = /^`npm run ([\w:-]+)`$/.exec(row.check);
    if (row.status === "Uncovered") {
      if (row.check !== "—") problems.push(`${id} is Uncovered but lists a check`);
    } else if (!command || !Object.hasOwn(scripts, command[1])) {
      problems.push(`${id} must name one executable root npm script`);
    }
  }
  assert.equal(problems.length, 0, `Invalid Day 4 traceability matrix:\n${problems.join("\n")}`);
  return { requirements: requestedRequirementIds.length, mapped: rows.length };
}

const [markdown, packageJson] = await Promise.all([
  readFile(join(root, "docs", "traceability.md"), "utf8"),
  readFile(join(root, "package.json"), "utf8").then(JSON.parse),
]);
const result = validateTraceability(markdown, packageJson);
console.log(`Traceability verified: ${result.mapped} exact requirement rows, including all ${result.requirements} requested IDs; uncovered requirements remain explicitly open.`);
