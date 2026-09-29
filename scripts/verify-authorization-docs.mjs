import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

import {
  WORKSPACE_ACTIONS,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  canPerform,
} from "../packages/contracts/dist/index.js";

const documentedRoleHeadings = ["Administrator", "Editor", "Viewer"];
const documentedActions = new Map([
  ["Read workspace", "workspace.read"],
  ["Update workspace", "workspace.update"],
  ["Delete workspace", "workspace.delete"],
  ["List members", "member.list"],
  ["Add member", "member.add"],
  ["Change member role", "member.change-role"],
  ["Remove member", "member.remove"],
  ["Create task", "task.create"],
  ["Read task", "task.read"],
  ["Update task", "task.update"],
  ["Delete task", "task.delete"],
]);

const authorizationDocument = await readFile(
  new URL("../docs/authorization.md", import.meta.url),
  "utf8",
);

const tableLines = authorizationDocument
  .split("\n")
  .filter((line) => line.startsWith("|"));
const heading = tableLines.find((line) => line.startsWith("| Operation |"));
assert.ok(heading, "AUT-1 permission-table heading is missing");

const headingCells = heading.split("|").slice(1, -1).map((cell) => cell.trim());
assert.deepEqual(
  headingCells,
  ["Operation", ...documentedRoleHeadings],
  "AUT-1 role columns do not match the executable roles",
);

const documentedRows = new Map(
  tableLines
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter(([operation]) => documentedActions.has(operation))
    .map(([operation, ...decisions]) => [operation, decisions]),
);

assert.equal(
  documentedRows.size,
  WORKSPACE_ACTIONS.length,
  "AUT-1 must document every executable action exactly once",
);

for (const [operation, action] of documentedActions) {
  const decisions = documentedRows.get(operation);
  assert.ok(decisions, `AUT-1 row is missing for ${operation}`);

  for (const [roleIndex, role] of WORKSPACE_ROLES.entries()) {
    const documentedDecision = decisions[roleIndex];
    assert.ok(
      documentedDecision === "yes" || documentedDecision === "no",
      `${operation}/${role} must be documented as yes or no`,
    );
    assert.equal(
      documentedDecision === "yes",
      canPerform(role, action),
      `AUT-1 disagrees with the executable policy for ${operation}/${role}`,
    );
    assert.equal(
      canPerform(role, action),
      WORKSPACE_PERMISSIONS[role][action],
      `the public policy function disagrees with its table for ${action}/${role}`,
    );
  }
}

console.log(
  `Authorization proof passed: ${WORKSPACE_ROLES.length} roles x ${WORKSPACE_ACTIONS.length} actions; AUT-1 matches the built public contract.`,
);