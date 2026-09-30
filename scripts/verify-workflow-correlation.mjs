#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const baseUrl = "http://localhost:3000";
const composeFiles = ["-f", "docker-compose.yml", "-f", "docker-compose.day4.yml"];
const password = "StrongPassword123!";
const email = `wf9-proof-${Date.now()}@example.com`;

function compose(args) {
  return execFileSync("docker", ["compose", ...composeFiles, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = response.status === 204 ? undefined : await response.json();
  return { response, body, requestId: response.headers.get("x-request-id") };
}

async function waitForCompleted(token, workflowId) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await request(`/api/v1/workflows/${workflowId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (result.body?.data?.workflow?.status === "completed") return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Workflow did not complete before correlation proof timeout");
}

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
const start = await request("/api/v1/workflows/workspace-provisioning", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "idempotency-key": `wf9-${Date.now()}`,
  },
  body: JSON.stringify({ workspaceName: `WF9 ${Date.now()}` }),
});
assert.equal(start.response.status, 202);
const correlationId = start.requestId;
assert.ok(correlationId !== null, "Gateway did not return a canonical request ID");
await waitForCompleted(token, start.body.data.workflow.id);

const services = ["account-service", "todo-service", "gateway", "workflow-worker"];
const missingServices = services.filter((service) => {
  const logs = compose(["logs", "--since", "90s", service]);
  return !logs.includes(correlationId);
});
assert.deepEqual(missingServices, [], `Correlation ID was missing from: ${missingServices.join(", ")}`);
console.log(`WF-9 proof passed: correlation ${correlationId} was present in workflow service logs.`);
