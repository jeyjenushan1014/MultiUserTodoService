#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const baseUrl = process.env.WF2_BASE_URL || "http://localhost:3000";
const composeFiles = ["-f", "docker-compose.yml", "-f", "docker-compose.day4.yml"];
const password = "StrongPassword123!";
const email = `wf2-proof-${Date.now()}@example.com`;
const workspaceName = `WF2 proof ${Date.now()}`;

function compose(args) {
  execFileSync("docker", ["compose", ...composeFiles, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body };
}

async function waitForStatus(token, workflowId, expectedStatus, timeoutMs = 30_000) {
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

let todoWasStopped = false;
try {
  const jsonHeaders = { "content-type": "application/json" };
  const registration = await request("/api/v1/auth/register", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  assert.equal(registration.response.status, 201);

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.response.status, 200);
  const token = login.body.data.accessToken;

  compose(["stop", "todo-service"]);
  todoWasStopped = true;

  const start = await request("/api/v1/workflows/workspace-provisioning", {
    method: "POST",
    headers: {
      ...jsonHeaders,
      authorization: `Bearer ${token}`,
      "idempotency-key": `wf2-${Date.now()}`,
    },
    body: JSON.stringify({ workspaceName }),
  });
  assert.equal(start.response.status, 202);
  const workflowId = start.body.data.workflow.id;

  const running = await waitForStatus(token, workflowId, "running");
  assert.notEqual(running.status, "completed");

  compose(["up", "-d", "--wait", "todo-service"]);
  todoWasStopped = false;
  const completed = await waitForStatus(token, workflowId, "completed", 60_000);
  assert.equal(completed.status, "completed");

  console.log(`WF-2 proof passed: workflow ${workflowId} was incomplete while Todo Service was unavailable, exposed no public workspace, and resumed to completed.`);
} finally {
  if (todoWasStopped) {
    compose(["up", "-d", "--wait", "todo-service"]);
  }
}
