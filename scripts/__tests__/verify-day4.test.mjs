import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { delimiter, resolve, join } from "node:path";
import { assertIsolatedConfig, cleanupComposeConfig, cloneCommittedSource, isolatedComposeEnvironment, isSnapshotSource, parseOptions, redactVerificationOutput, snapshotCurrentSource, verificationEnvironment, waitForProgress } from "../verify-day4.mjs";

test("cleanup retains named-volume references without secret bind mounts", () => {
  const data = { type: "volume", source: "data", target: "/data" };
  const config = {
    services: {
      database: { image: "postgres:17", volumes: [data], environment: { PASSWORD: "not-retained" } },
      writer: { volumes: [{ type: "bind", source: "/private", target: "/run/secrets", read_only: true }] },
    },
    volumes: { data: { name: "isolated_data" } },
    networks: { default: { name: "isolated_default" } },
  };
  assert.deepEqual(cleanupComposeConfig(config, "isolated"), {
    name: "isolated",
    services: {
      database: { image: "postgres:17", volumes: [data] },
      writer: { image: "node:24-alpine", volumes: [] },
    },
    volumes: config.volumes,
    networks: config.networks,
  });
});

test("rejects legacy/unsafe command-line overrides", () => {
  assert.deepEqual(parseOptions(["--ref", "HEAD~1", "--keep"]), { ref: "HEAD~1", keep: true });
  assert.throws(() => parseOptions(["--project", "live"]));
  assert.throws(() => parseOptions(["--ref", "--keep"]));
  assert.deepEqual(parseOptions(["--working-tree"]), { ref: "HEAD", keep: false, workingTree: true });
  assert.deepEqual(parseOptions(["--clean-clone"]), { ref: "HEAD", keep: false, workingTree: true });
  assert.throws(() => parseOptions(["--clean-clone", "--ref", "HEAD"]));
});
test("ephemeral verification environment does not inherit live selectors/secrets", () => {
  const env = verificationEnvironment("isolated", "tag", "scratch", "clone", {
    PATH: "path", COMPOSE_FILE: "live.yml", COMPOSE_PROJECT_NAME: "live", JWT_SECRET: "real",
    CONTAINER_CHAIN_RPC_URL: "https://mainnet", MAIL_PROVIDER_HOST: "real-smtp",
    ACCOUNT_DATABASE_URL: "production", RABBITMQ_URL: "production",
  });
  assert.equal(env.PATH, "path");
  assert.equal(env.COMPOSE_FILE, undefined);
  assert.equal(env.COMPOSE_PROJECT_NAME, "isolated");
  assert.notEqual(env.JWT_SECRET, "real");
  assert.equal(env.CONTAINER_CHAIN_RPC_URL, "http://verification-chain:8545");
  assert.equal(env.MAIL_TEST_SINK_ONLY, "true");
  assert.equal(env.MAIL_PROVIDER_HOST, "");
  assert.match(env.ACCOUNT_DATABASE_URL, /@account-postgres:5432\/verify_account$/);
  assert.match(env.RABBITMQ_URL, /@rabbitmq:5672$/);
});
test("host operator child inherits exactly the isolated Compose files and empty env selector", () => {
  const clone = resolve("clone");
  const empty = resolve("scratch", "empty.env");
  const env = isolatedComposeEnvironment({ COMPOSE_PROJECT_NAME: "todo-day4-verify-fixture", DAY4_COMPOSE_PROJECT: "todo-day4-verify-fixture" }, clone, empty);
  assert.deepEqual(env.COMPOSE_FILE.split(delimiter), [join(clone, "docker-compose.yml"), join(clone, "scripts", "day4.compose.yml")]);
  assert.equal(env.COMPOSE_PATH_SEPARATOR, delimiter);
  assert.equal(env.COMPOSE_ENV_FILES, empty);
  assert.equal(env.COMPOSE_DISABLE_ENV_FILE, "1");
  assert.equal(env.COMPOSE_PROJECT_NAME, env.DAY4_COMPOSE_PROJECT);
});
test("operator stdout and stderr redact credential values", () => {
  assert.equal(redactVerificationOutput("postgres://private secret-value visible", {
    ACCOUNT_DATABASE_URL: "postgres://private", JWT_SECRET: "secret-value",
  }), "[REDACTED] [REDACTED] visible");
  assert.equal(redactVerificationOutput("failed at http://local:1234/path postgres://other:secret@db/name", {}), "failed at [REDACTED_URL] [REDACTED_URL]");
});
test("refuses published ports, shared resources and host escape", () => {
  const valid = { name: "isolated", services: { api: {} }, volumes: { db: { name: "isolated_db" } } };
  assert.doesNotThrow(() => assertIsolatedConfig(valid, "isolated"));
  for (const service of [{ ports: ["3000:3000"] }, { network_mode: "host" }, { privileged: true }, { container_name: "live" }]) {
    assert.throws(() => assertIsolatedConfig({ ...valid, services: { api: service } }, "isolated"));
  }
  assert.throws(() => assertIsolatedConfig({ ...valid, volumes: { db: { name: "live_db" } } }, "isolated"));
  assert.throws(() => assertIsolatedConfig({ ...valid, networks: { default: { external: true } } }, "isolated"));
  assert.throws(() => assertIsolatedConfig(valid, "live"));
  for (const volume of [
    { type: "bind", source: resolve("live"), read_only: true },
    { type: "bind", source: resolve("clone"), read_only: false },
  ]) {
    assert.throws(() => assertIsolatedConfig({ ...valid, services: { api: { volumes: [volume] } } }, "isolated", [resolve("clone")]));
  }
});

test("real clean clone uses only committed source, excluding edited files and local secrets", async () => {
  const scratch = resolve(".verification", `clone-test-${randomBytes(6).toString("hex")}`);
  const repository = join(scratch, "repository");
  const clone = join(scratch, "clone");
  await mkdir(repository, { recursive: true });
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: repository, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git("init", "--quiet");
    await writeFile(join(repository, "tracked.txt"), "committed");
    git("add", "tracked.txt");
    git("-c", "user.name=Verification Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Committed-source fixture");
    const revision = git("rev-parse", "HEAD");
    await writeFile(join(repository, "tracked.txt"), "uncommitted edit");
    await writeFile(join(repository, ".env"), "DO_NOT_CLONE=synthetic-secret");
    await mkdir(join(repository, "node_modules"));
    await writeFile(join(repository, "node_modules", "local.txt"), "host dependencies");
    await mkdir(join(repository, "scripts"));
    await writeFile(join(repository, "scripts", "new-script.mjs"), "intended new source");
    await writeFile(join(repository, "deleted.txt"), "deleted tracked source");
    git("add", "deleted.txt");
    await rm(join(repository, "deleted.txt"));
    await mkdir(join(repository, "secrets"));
    await writeFile(join(repository, "secrets", "private.txt"), "synthetic secret");
    await mkdir(join(repository, "apps", "fixture", "dist"), { recursive: true });
    await writeFile(join(repository, "apps", "fixture", "dist", "built.js"), "old build");
    assert.equal(cloneCommittedSource(repository, clone), revision);
    assert.equal(await readFile(join(clone, "tracked.txt"), "utf8"), "committed");
    await assert.rejects(readFile(join(clone, ".env")), { code: "ENOENT" });
    await assert.rejects(readFile(join(clone, "node_modules", "local.txt")), { code: "ENOENT" });
    assert.equal(await readFile(join(repository, "tracked.txt"), "utf8"), "uncommitted edit");
    const snapshot = join(scratch, "snapshot");
    const source = await snapshotCurrentSource(repository, snapshot);
    assert.equal(source.revision, revision);
    assert.equal(source.sourceKind, "uncommitted-clean-source-snapshot");
    assert.match(source.snapshotSha256, /^[a-f0-9]{64}$/);
    assert.equal(source.files, 2);
    assert.equal(await readFile(join(snapshot, "tracked.txt"), "utf8"), "uncommitted edit");
    assert.equal(await readFile(join(snapshot, "scripts", "new-script.mjs"), "utf8"), "intended new source");
    for (const path of [".env", "node_modules/local.txt", "secrets/private.txt", "apps/fixture/dist/built.js", "deleted.txt"]) {
      await assert.rejects(readFile(join(snapshot, path)), { code: "ENOENT" });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("snapshot exclusions apply even to tracked secret and generated paths", () => {
  for (const path of [".env", ".env.local", "apps/a/.env.production", "secrets/mail/smtp.json",
    "apps/a/node_modules/module.js", "apps/a/dist/server.js", ".verification/source.js", "../outside.txt",
    "private-key.json", "tls.pem", "account.dump", ".git/config", "contracts/onchain/artifacts/compiled.json", "contracts/onchain/cache/generated.json"]) {
    assert.equal(isSnapshotSource(path), false, path);
  }
  for (const path of [".env.example", "scripts/new-script.mjs", "apps/a/src/server.ts",
    "contracts/onchain/ignition/deployments/chain-31337/build-info/fixture.json",
    "contracts/onchain/ignition/deployments/chain-31337/artifacts/TaskHistoryModule#TaskHistory.json",
    "apps/todo-service/src/modules/todo/cache/redis.todo.read.cache.ts"]) {
    assert.equal(isSnapshotSource(path), true, path);
  }
  assert.equal(isSnapshotSource("unreviewed.json", true), false);
  assert.equal(isSnapshotSource("scripts/private.bin", true), false);
  assert.equal(isSnapshotSource("scripts/day4-validation.Dockerfile", true), true);
  assert.equal(isSnapshotSource("scripts/new-helper.mjs", true), true);
});

test("progress readiness requires the real caught-up checkpoint and every drained consumer", async () => {
  const healthy = {
    chainReader: { status: "caught-up" },
    consumers: Array.from({ length: 6 }, () => ({ status: "available", consumers: 2, ready: 0, unacknowledged: 0 })),
  };
  assert.equal(await waitForProgress(async () => healthy), healthy);
  for (const unhealthy of [
    { ...healthy, chainReader: { status: "not-initialized" } },
    { ...healthy, chainReader: { status: "behind" } },
    { ...healthy, consumers: [] },
    { ...healthy, consumers: healthy.consumers.map((consumer, i) => i === 5 ? { ...consumer, consumers: 0 } : consumer) },
    { ...healthy, consumers: healthy.consumers.map((consumer, i) => i === 5 ? { ...consumer, unacknowledged: 1 } : consumer) },
  ]) {
    await assert.rejects(waitForProgress(async () => unhealthy, { timeoutMs: 0 }), /readiness timed out/);
  }
  let calls = 0;
  let clock = 0;
  await waitForProgress(async () => {
    calls++;
    if (calls === 1) throw new Error("Broker not ready");
    return healthy;
  }, { timeoutMs: 2000, now: () => clock, sleep: async (ms) => { clock += ms; } });
  assert.equal(calls, 2);
});
