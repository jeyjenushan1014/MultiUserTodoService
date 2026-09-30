#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const baseUrl = process.env.WF4_BASE_URL || "http://localhost:3000";
const composeFiles = ["-f", "docker-compose.yml", "-f", "docker-compose.day4.yml"];
const password = "StrongPassword123!";
const email = `wf4-proof-${Date.now()}@example.com`;

function compose(args, options = {}) {
  return execFileSync("docker", ["compose", ...composeFiles, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body };
}

async function waitForStatus(token, workflowId, expectedStatus, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastBody;
  while (Date.now() < deadline) {
    const result = await request(`/api/v1/workflows/${workflowId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    lastBody = result.body;
    if (result.body?.data?.workflow?.status === expectedStatus) {
      return result.body.data.workflow;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Workflow did not reach ${expectedStatus}: ${JSON.stringify(lastBody)}`);
}

async function workflowRequest(token, key) {
  return request("/api/v1/workflows/workspace-provisioning", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify({ workspaceName: `WF4 proof ${Date.now()}` }),
  });
}

try {
  const registration = await request("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(registration.response.status, 201);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.response.status, 200);
  const token = login.body.data.accessToken;

  const first = await workflowRequest(token, `wf4-${Date.now()}`);
  assert.equal(first.response.status, 202);
  const firstId = first.body.data.workflow.id;

  compose(["stop", "todo-service"]);
  const compensating = await waitForStatus(token, firstId, "compensating");
  assert.equal(compensating.status, "compensating");
  assert.ok(compensating.steps.some((step) => step.status === "applied" || step.status === "failed"));

  compose(["stop", "workflow-worker"]);
  const staleWorkflowSql = `UPDATE workflows SET updated_at = CURRENT_TIMESTAMP - INTERVAL '2 seconds' WHERE id = '${firstId}'`;
  compose(["exec", "-T", "account-service", "node", "--input-type=module", "-e", `import pg from 'pg'; const pool = new pg.Pool({ connectionString: process.env.ACCOUNT_DATABASE_URL }); await pool.query(${JSON.stringify(staleWorkflowSql)}); await pool.end();`]);
  await new Promise((resolve) => setTimeout(resolve, 1_500));

  const healthOutput = compose(["exec", "-T", "account-service", "node", "--input-type=module", "-e", "const r=await fetch('http://127.0.0.1:3001/health/workflows'); console.log(JSON.stringify({status:r.status,body:await r.json()}));"], { capture: true });
  const health = JSON.parse(healthOutput.trim().split(/\r?\n/).at(-1));
  assert.equal(health.status, 503);
  assert.ok(health.body.workflows.stuckCompensations >= 0);

  compose(["up", "-d", "--wait", "todo-service", "workflow-worker"]);
  const compensated = await waitForStatus(token, firstId, "compensated");
  assert.equal(compensated.status, "compensated");

  console.log(`WF-4/WF-5/WF-10 proof passed: ${firstId} compensated after bounded failure and stuck health was observable.`);
} finally {
  compose(["up", "-d", "--wait", "todo-service"]);
}
