#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const keepStack = process.env.DAY4_KEEP_STACK === "1";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, label) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32" && command === npmCommand,
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

async function waitForHealth() {
  const url = process.env.DAY4_HEALTH_URL || "http://localhost:3000/health/dependencies";
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "healthy") {
          console.log(`Healthy: ${url}`);
          return;
        }
      }
    } catch {
      // The stack may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Stack did not become healthy within 120 seconds: ${url}`);
}

let verificationError;
try {
  run("docker", ["compose", "down", "-v", "--remove-orphans"], "Reset disposable verification state");
  run("docker", ["compose", "up", "-d", "--build"], "Build and start the complete stack");
  await waitForHealth();

  run(npmCommand, ["run", "check"], "Lint, build, and unit tests");
  run(npmCommand, ["run", "test:docs"], "API documentation verification");
  run(npmCommand, ["run", "verify:authorization"], "AUT-1 through AUT-5 verification");
  run(npmCommand, ["run", "test:e2e", "-w", "@todo/gateway"], "Complete live E2E suite");
  run(
    "docker",
    ["compose", "exec", "-T", "account-service", "node", "apps/account-service/scripts/verify-workspace-concurrency.mjs"],
    "TN-9 PostgreSQL concurrency proof",
  );
  run(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "todo-service",
      "sh",
      "-c",
      "node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key \"$INTERNAL_SERVICE_SECRET\"",
    ],
    "TN-11 repeatable backfill dry-run",
  );

  console.log("\nDay 4 verification passed for all currently implemented checks.");
} catch (error) {
  verificationError = error;
} finally {
  if (!keepStack) {
    try {
      run("docker", ["compose", "down", "-v", "--remove-orphans"], "Clean verification stack");
    } catch (cleanupError) {
      console.error(`Cleanup failed: ${cleanupError.message}`);
      if (verificationError === undefined) {
        verificationError = cleanupError;
      }
    }
  } else {
    console.log("DAY4_KEEP_STACK=1: verification stack left running for inspection.");
  }
}

if (verificationError !== undefined) {
  console.error(`\nDay 4 verification failed: ${verificationError.message}`);
  process.exitCode = 1;
}
