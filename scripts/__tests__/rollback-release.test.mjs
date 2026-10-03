import assert from "node:assert/strict";
import test from "node:test";
import { rollbackRelease, parseArguments, serviceImages } from "../rollback-release.mjs";

function fixture({ replicas = 3, failTargetProbe = false, failTargetApply = false, failRestore = false, worker = false } = {}) {
  const service = worker ? "todo-history-worker" : "todo-service";
  const image = serviceImages[service];
  let tag = "current";
  let clock = 0;
  const calls = [];
  const run = (args, env) => {
    calls.push({ args, tag: env.APP_RELEASE_ID });
    if (args[0] === "image") return JSON.stringify([{ Id: args[2].endsWith(":current") ? "sha-current" : "sha-prior" }]);
    if (args[1] === "config") return JSON.stringify({ services: { [service]: { image: `${image}:${env.APP_RELEASE_ID}` } } });
    if (args[1] === "ps") return Array.from({ length: replicas }, (_, i) => `id${i}`).join("\n");
    if (args[0] === "inspect") return JSON.stringify(Array.from({ length: replicas }, (_, i) => ({
      Id: `id${i}`, Config: { Image: `${image}:${tag}` }, Image: tag === "current" ? "sha-current" : "sha-prior",
      State: { Running: !(worker && failTargetProbe && tag === "prior" && i === replicas - 1) },
    })));
    if (args[1] === "up") {
      tag = env.APP_RELEASE_ID;
      if ((tag === "prior" && failTargetApply) || (tag === "current" && failRestore)) throw new Error("apply failed");
    }
    if (args[0] === "exec" && failTargetProbe && tag === "prior" && args[1] === `id${replicas - 1}`) throw new Error("probe failed");
    return "";
  };
  return {
    calls, run, env: { ROLLBACK_OPERATOR_ID: "test-operator" }, timeoutMs: 2,
    now: () => clock, sleep: async (ms) => { clock += ms; },
    options: { service, current: "current", release: "prior" },
  };
}

test("preserves non-default count and verifies every replica", async () => {
  const f = fixture();
  const result = await rollbackRelease(f.options, f);
  assert.equal(result.replicas, 3);
  assert.deepEqual(f.calls.filter((c) => c.args[0] === "exec").map((c) => c.args[1]), ["id0", "id1", "id2"]);
  const up = f.calls.find((c) => c.args[1] === "up");
  assert.ok(up.args.includes("todo-service=3"));
  assert.ok(up.args.includes("--no-deps"));
  assert.ok(up.args.includes("never"));
});

for (const failure of ["failTargetProbe", "failTargetApply"]) {
  test(`${failure} restores and verifies the current release`, async () => {
    const f = fixture({ [failure]: true });
    await assert.rejects(rollbackRelease(f.options, f), /restored and verified all 3/);
    assert.deepEqual(f.calls.filter((c) => c.args[1] === "up").map((c) => c.tag), ["prior", "current"]);
    assert.equal(f.calls.filter((c) => c.args[0] === "exec" && c.tag === "current").length, 3);
  });
}
test("checks all worker replicas rather than a service name", async () => {
  const f = fixture({ worker: true, failTargetProbe: true });
  await assert.rejects(rollbackRelease(f.options, f), /restored and verified/);
});
test("reports failed restoration distinctly", async () => {
  const f = fixture({ failTargetProbe: true, failRestore: true });
  await assert.rejects(rollbackRelease(f.options, f), /restoration FAILED/);
});
test("rejects invalid options before side effects", () => {
  for (const service of ["redis", "__proto__", "toString"]) {
    assert.throws(() => parseArguments(["--service", service, "--current", "a", "--release", "b"]));
  }
  assert.throws(() => parseArguments(["--service", "gateway", "--current", "a", "--release", "a"]));
});
test("preflight rejects one mixed current replica without changing the service", async () => {
  const f = fixture();
  const original = f.run;
  f.run = (args, env) => {
    const output = original(args, env);
    if (args[0] !== "inspect") return output;
    const containers = JSON.parse(output);
    containers[2].Config.Image = "unexpected:latest";
    return JSON.stringify(containers);
  };
  await assert.rejects(rollbackRelease(f.options, f), /every existing replica/);
  assert.equal(f.calls.filter((c) => c.args[1] === "up").length, 0);
});
test("preflight refuses an override selecting another image", async () => {
  const f = fixture();
  const original = f.run;
  f.run = (args, env) => args[1] === "config"
    ? JSON.stringify({ services: { "todo-service": { image: "unrelated:latest" } } })
    : original(args, env);
  await assert.rejects(rollbackRelease(f.options, f), /Compose must select/);
  assert.equal(f.calls.filter((c) => c.args[1] === "up").length, 0);
});
test("honors explicit project/file selectors during apply and restoration", async () => {
  const f = fixture({ failTargetProbe: true });
  f.env = { ...f.env, COMPOSE_PROJECT_NAME: "isolated", COMPOSE_FILE: "isolated.yml" };
  const original = f.run;
  f.run = (args, env) => {
    assert.equal(env.COMPOSE_PROJECT_NAME, "isolated");
    assert.equal(env.COMPOSE_FILE, "isolated.yml");
    return original(args, env);
  };
  await assert.rejects(rollbackRelease(f.options, f), /restored and verified/);
});
