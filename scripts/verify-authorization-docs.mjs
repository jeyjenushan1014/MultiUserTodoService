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

async function assertSourceContains(relativePath, text, requirement) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  assert.ok(source.includes(text), `${requirement} source anchor is missing: ${relativePath}`);
}

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

assert.ok(
  authorizationDocument.includes("packages/contracts/src/authorization/workspace-authorization.ts") &&
    authorizationDocument.includes("canPerform(role, action)") &&
    authorizationDocument.includes("authorizeWorkspace"),
  "AUT-2 must identify one canonical policy source and its enforcement path",
);
await assertSourceContains(
  "packages/contracts/src/authorization/workspace-authorization.ts",
  "canPerform",
  "AUT-2",
);
await assertSourceContains(
  "apps/gateway/src/middleware/authorize-workspace.middleware.ts",
  "canPerform(role, action)",
  "AUT-2",
);
await assertSourceContains(
  "apps/todo-service/src/middleware/authorize-workspace.middleware.ts",
  "canPerform(role, action)",
  "AUT-2",
);

for (const requiredPhrase of [
  "last administrator",
  "person in no workspace",
  "legacy",
]) {
  assert.ok(
    authorizationDocument.toLowerCase().includes(requiredPhrase),
    `AUT-3 documentation must describe: ${requiredPhrase}`,
  );
}
await assertSourceContains(
  "apps/account-service/src/modules/workspace/workspace.repository.ts",
  "hasAnotherAdministrator",
  "AUT-3",
);
await assertSourceContains(
  "apps/todo-service/migrations/20260925170000_add_workspace_id_to_todos.cjs",
  "workspace_id",
  "AUT-3",
);

assert.match(
  authorizationDocument,
  /maximum[\s\S]*?15\s+seconds/i,
  "AUT-4 must document the maximum authorization propagation time",
);
assert.ok(
  authorizationDocument.includes("WORKSPACE_ACTION_FORBIDDEN") &&
    authorizationDocument.includes("404") &&
    /reveals nothing|cannot learn|not inferable/i.test(authorizationDocument),
  "AUT-5 must document refusal status, error shape, and non-disclosure behavior",
);
await assertSourceContains(
  "apps/gateway/src/middleware/authorize-workspace.middleware.ts",
  "WORKSPACE_ACTION_FORBIDDEN",
  "AUT-5",
);

console.log(
  `Authorization proof passed: AUT-1 through AUT-5; ${WORKSPACE_ROLES.length} roles x ${WORKSPACE_ACTIONS.length} actions match the built public contract and documented enforcement rules.`,
);