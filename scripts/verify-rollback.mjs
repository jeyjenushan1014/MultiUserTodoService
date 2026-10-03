import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rollbackRelease, serviceImages } from "./rollback-release.mjs";

export async function verifyRollback({ sourceImage, cwd = process.cwd(), env = process.env } = {}) {
  const id = randomBytes(6).toString("hex");
  const project = `todo-rollback-verify-${id}`;
  const current = `rehearsal-current-${id}`;
  const prior = `rehearsal-prior-${id}`;
  const image = serviceImages["todo-service"];
  const here = dirname(fileURLToPath(import.meta.url));
  const isolatedEnv = {
    ...env, COMPOSE_FILE: resolve(here, "rollback-rehearsal.compose.yml"),
    COMPOSE_PROJECT_NAME: project, APP_RELEASE_ID: current,
    ROLLBACK_OPERATOR_ID: "isolated-rehearsal", REHEARSAL_FAIL_TAG: "",
  };
  const run = (args, commandEnv = isolatedEnv) => {
    const result = spawnSync("docker", args, { cwd, env: commandEnv, encoding: "utf8", timeout: 180_000 });
    if (result.error || result.status !== 0) throw new Error(`Rehearsal Docker ${args[0]} failed (${result.error?.code ?? result.status})`);
    return result.stdout ?? "";
  };
  const references = [`${image}:${current}`, `${image}:${prior}`];
  let stackStarted = false;
  try {
    if (sourceImage) run(["image", "tag", sourceImage, references[0]]);
    else run(["build", "-f", resolve(here, "rollback-rehearsal.Dockerfile"), "-t", references[0], here]);
    run(["image", "tag", references[0], references[1]]);
    const retained = JSON.parse(run(["image", "inspect", ...references]));
    assert.equal(retained[0].Id, retained[1].Id, "Rehearsal intentionally uses one build under two tags");
    stackStarted = true;
    run(["compose", "up", "-d", "--no-build", "--pull", "never", "--scale", "todo-service=3"]);
    const options = { service: "todo-service", current, release: prior };
    const result = await rollbackRelease(options, { run, env: isolatedEnv, timeoutMs: 30_000 });
    assert.equal(result.replicas, 3);
    assert.equal(result.imageReference, references[1]);
    const ids = run(["compose", "ps", "--quiet", "todo-service"]).trim().split(/\s+/);
    const actual = JSON.parse(run(["inspect", ...ids]));
    assert.equal(actual.length, 3);
    assert.ok(actual.every((c) => c.Config.Image === references[1] && c.Image === retained[0].Id));
    await rollbackRelease({ service: "todo-service", current: prior, release: current }, { run, env: isolatedEnv, timeoutMs: 30_000 });
    await assert.rejects(rollbackRelease(options, {
      run, env: { ...isolatedEnv, REHEARSAL_FAIL_TAG: prior }, timeoutMs: 5_000,
    }), /restored and verified all 3/);
    const restoredIds = run(["compose", "ps", "--quiet", "todo-service"]).trim().split(/\s+/);
    const restored = JSON.parse(run(["inspect", ...restoredIds]));
    assert.equal(restored.length, 3);
    assert.ok(restored.every((c) => c.Config.Image === references[0] && c.State.Running));
    const evidence = {
      result: "passed", project, replicas: 3, from: references[0], to: references[1],
      imageId: retained[0].Id, actualReferenceSwitch: true, failedHealthRestored: true,
      scope: "same-build retained-tag mechanics rehearsal; NOT genuine historical release compatibility",
    };
    console.log(JSON.stringify(evidence));
    return evidence;
  } finally {
    try {
      if (stackStarted) run(["compose", "down", "--volumes", "--remove-orphans"]);
    } finally {
      // Remove only this run's unique aliases, never the source image.
      for (const ref of references) {
        const result = spawnSync("docker", ["image", "rm", ref], { cwd, env: isolatedEnv, encoding: "utf8", timeout: 30_000 });
        if (result.status !== 0) console.error(`Could not remove rehearsal alias ${ref}`);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRollback().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
