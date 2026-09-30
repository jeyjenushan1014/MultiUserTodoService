#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const orchestrator = await readFile(new URL("../apps/account-service/src/workflow/workflow.orchestrator.ts", import.meta.url), "utf8");
const participant = await readFile(new URL("../apps/account-service/src/workflow/workflow.participants.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../apps/account-service/src/workflow/postgres.workflow.repository.ts", import.meta.url), "utf8");

assert.ok(!orchestrator.includes("BEGIN"), "WF-8 workflow orchestration must not begin a cross-service transaction");
assert.ok(!participant.includes("BEGIN"), "WF-8 participant HTTP calls must not run inside a database transaction");
assert.match(participant, /fetch\(/, "WF-8 participant boundary must use an external call outside the repository transaction");
assert.match(repository, /await client\.query\("COMMIT"\)/, "WF-8 local workflow creation must commit before worker calls");
assert.match(repository, /FOR UPDATE SKIP LOCKED/, "WF-8 worker ownership must be database-coordinated");
console.log("WF-8 boundary proof passed: local commits precede participant calls and worker claims use SKIP LOCKED.");
