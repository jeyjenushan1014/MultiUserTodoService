#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyRollback } from "./verify-rollback.mjs";
import { privateKeyToAccount } from "viem/accounts";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commandTimeoutMs = 600_000;

export function cleanupComposeConfig(config, project) {
  return {
    name: project,
    services: Object.fromEntries(Object.entries(config.services).map(([name, service]) =>
      [name, {
        image: service.image ?? "node:24-alpine",
        volumes: (service.volumes ?? []).filter((mount) => mount.type === "volume"),
      }])),
    volumes: config.volumes,
    networks: config.networks,
  };
}

export function parseOptions(args) {
  const options = { ref: "HEAD", keep: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--keep") options.keep = true;
    else if (args[i] === "--pagination-only") options.paginationOnly = true;
    else if (args[i] === "--performance-only") options.performanceOnly = true;
    else if (args[i] === "--query-plans-only") options.queryPlansOnly = true;
    else if (args[i] === "--working-tree" || args[i] === "--clean-clone") options.workingTree = true;
    else if (args[i] === "--ref" && args[i + 1] && !args[i + 1].startsWith("-")) options.ref = args[++i];
    else throw new Error("Usage: verify-day4.mjs [--ref <committed-revision> | --working-tree] [--pagination-only | --performance-only | --query-plans-only] [--keep]");
  }
  if (options.workingTree && args.includes("--ref")) throw new Error("--working-tree snapshots the current source and cannot be combined with --ref");
  if ([options.paginationOnly, options.performanceOnly, options.queryPlansOnly].filter(Boolean).length > 1) {
    throw new Error("Choose one verification scope");
  }
  return options;
}

export function parseLastJsonLine(output, label) {
  const lines = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error(`${label} produced no JSON output`);
  const candidate = lines.at(-1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`${label} produced non-JSON trailing output: ${error.message}`);
  }
}

export function isSnapshotSource(path, untracked = false) {
  const parts = path.split(/[\\/]/);
  if (parts.some((part) => !part || part === ".." || [
    ".git", ".verification", "node_modules", "dist", "coverage", "secrets", ".secrets",
    "tmp", "temp", ".vscode", ".idea", "typechain-types",
  ].includes(part.toLowerCase()))) return false;
  if (["contracts/onchain/artifacts", "contracts/onchain/cache"].includes(parts.slice(0, 3).join("/").toLowerCase())) return false;
  const name = parts.at(-1);
  if ((name.startsWith(".env") && name !== ".env.example") ||
    /\.(?:pem|key|pfx|p12|dump|bak|log|tsbuildinfo)$/i.test(name) ||
    /^(?:credentials|smtp|private[-_]key|id_rsa|id_ed25519)(?:[._-]|$)/i.test(name)) return false;
  if (untracked && !(
    /^(?:scripts|apps|packages|contracts|docker|docs|\.github)[\\/]/.test(path) &&
    /\.(?:mjs|cjs|js|ts|tsx|jsx|json|yml|yaml|md|sol|conf|sql|html|css)$/i.test(name)
  ) && !(/^(?:scripts|docker)[\\/]/.test(path) && /\.Dockerfile$/i.test(name))) return false;
  return true;
}

export async function snapshotCurrentSource(repository, destination) {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: repository, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error("Cannot enumerate current source snapshot");
    return result.stdout;
  };
  const revision = git(["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  cloneCommittedSource(repository, destination);
  const committedPaths = git(["ls-tree", "-r", "--name-only", "-z", "HEAD"]).split("\0").filter(Boolean);
  for (const path of committedPaths) {
    if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) throw new Error("Invalid committed snapshot path");
    await rm(join(destination, ...path.split(/[\\/]/)), { force: true });
  }
  const tracked = git(["ls-files", "--cached", "-z"]).split("\0").filter((path) => path && isSnapshotSource(path));
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0")
    .filter((path) => path && isSnapshotSource(path, true));
  const paths = [...new Set([...tracked, ...untracked])].sort();
  const digest = createHash("sha256");
  let files = 0;
  await mkdir(destination, { recursive: true });
  for (const path of paths) {
    const parts = path.split(/[\\/]/);
    let stat;
    try {
      // Refuse links at every level: a tracked path must not read outside the source tree.
      for (let i = 1; i <= parts.length; i++) {
        stat = await lstat(join(repository, ...parts.slice(0, i)));
        if (stat.isSymbolicLink()) throw new Error(`Snapshot refuses symbolic link: ${path}`);
      }
    } catch (error) {
      if (error.code === "ENOENT") continue; // A tracked file deleted in the current working tree.
      throw error;
    }
    if (!stat.isFile()) throw new Error(`Snapshot source is not a regular file: ${path}`);
    const contents = await readFile(join(repository, ...parts));
    const target = join(destination, ...parts);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, { mode: stat.mode & 0o777 });
    digest.update(path).update("\0").update(contents).update("\0");
    files++;
  }
  if (!files) throw new Error("Current source snapshot is empty");
  return { revision, sourceKind: "uncommitted-clean-source-snapshot", snapshotSha256: digest.digest("hex"), files };
}

export function verificationEnvironment(project, release, scratch, clone, inherited = process.env) {
  // Do not inherit Compose selectors, .env values, public RPC URLs or production credentials.
  const env = Object.fromEntries(["PATH", "Path", "SystemRoot", "SYSTEMROOT", "HOME", "USERPROFILE",
    "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
    "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"]
    .filter((key) => inherited[key] !== undefined).map((key) => [key, inherited[key]]));
  const secret = () => randomBytes(32).toString("hex");
  Object.assign(env, {
    COMPOSE_PROJECT_NAME: project, DAY4_COMPOSE_PROJECT: project, APP_RELEASE_ID: release,
    ACCOUNT_POSTGRES_USER: "verify_account", ACCOUNT_POSTGRES_PASSWORD: secret(), ACCOUNT_POSTGRES_DB: "verify_account",
    TODO_POSTGRES_USER: "verify_todo", TODO_POSTGRES_PASSWORD: secret(), TODO_POSTGRES_DB: "verify_todo",
    EV_POSTGRES_PASSWORD: secret(),
    REDIS_PASSWORD: secret(), RABBITMQ_USER: "verify_broker", RABBITMQ_PASSWORD: secret(),
    INTERNAL_SERVICE_SECRET: secret(), JWT_SECRET: secret(),
    CHAIN_WRITER_ADDRESS: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    TASK_HISTORY_CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    TASK_HISTORY_DEPLOYMENT_BLOCK: "1", CHAIN_ID: "31337", CHAIN_CONFIRMATIONS: "2",
    CONTAINER_CHAIN_RPC_URL: "http://verification-chain:8545",
    MAIL_TEST_SINK_ONLY: "true", MAIL_PROVIDER_HOST: "", MAIL_PROVIDER_FROM: "",
    MAIL_SECRET_DIR: join(scratch, "empty-mail-secrets"),
    CHAIN_SECRET_DIR: join(scratch, "chain-secrets"),
    VERIFICATION_SOURCE: clone, VERIFICATION_SCRIPTS: join(clone, "scripts"),
    MAIL_RETRY_FIRST_MS: "1000", MAIL_RETRY_SECOND_MS: "1500",
    LOG_LEVEL: "warn",
  });
  env.TODO_DATABASE_URL = `postgres://${env.TODO_POSTGRES_USER}:${env.TODO_POSTGRES_PASSWORD}@todo-postgres:5432/${env.TODO_POSTGRES_DB}`;
  env.EV_DATABASE_URL = `postgres://verify_evolution:${env.EV_POSTGRES_PASSWORD}@evolution-postgres:5432/postgres`;
  env.ACCOUNT_DATABASE_URL = `postgres://${env.ACCOUNT_POSTGRES_USER}:${env.ACCOUNT_POSTGRES_PASSWORD}@account-postgres:5432/${env.ACCOUNT_POSTGRES_DB}`;
  env.RABBITMQ_URL = `amqp://${env.RABBITMQ_USER}:${env.RABBITMQ_PASSWORD}@rabbitmq:5672`;
  env.REDIS_URL = `redis://:${env.REDIS_PASSWORD}@redis:6379`;
  return env;
}

export function assertIsolatedConfig(config, project, allowedBindRoots = []) {
  if (config.name !== project) throw new Error("Compose project is not isolated");
  for (const [name, service] of Object.entries(config.services)) {
    if (service.ports?.length) throw new Error(`Verification must not publish host ports: ${name}`);
    if (service.container_name || service.network_mode || service.privileged) {
      throw new Error(`Unsafe verification service: ${name}`);
    }
    if (allowedBindRoots.length) {
      for (const volume of service.volumes ?? []) {
        if (volume.type !== "bind") continue;
        const within = allowedBindRoots.some((root) => {
          const path = relative(resolve(root), resolve(volume.source));
          return path === "" || (!path.startsWith("..") && !isAbsolute(path));
        });
        if (!within || !volume.read_only) throw new Error(`Unsafe verification bind mount: ${name}`);
      }
    }
  }
  for (const [kind, resources] of Object.entries({ volumes: config.volumes, networks: config.networks })) {
    for (const resource of Object.values(resources ?? {})) {
      if (resource.external || (resource.name && !resource.name.startsWith(`${project}_`))) {
        throw new Error(`Verification must not reuse external or live ${kind}`);
      }
    }
  }
}

export function isolatedComposeEnvironment(env, clone, emptyEnvFile) {
  return {
    ...env,
    COMPOSE_FILE: [join(clone, "docker-compose.yml"), join(clone, "scripts", "day4.compose.yml")].join(delimiter),
    COMPOSE_PATH_SEPARATOR: delimiter,
    COMPOSE_ENV_FILES: emptyEnvFile,
    COMPOSE_DISABLE_ENV_FILE: "1",
  };
}

export function redactVerificationOutput(output, env) {
  let text = String(output ?? "");
  for (const key of ["ACCOUNT_DATABASE_URL", "TODO_DATABASE_URL", "REDIS_URL", "RABBITMQ_URL",
    "ACCOUNT_POSTGRES_PASSWORD", "TODO_POSTGRES_PASSWORD", "REDIS_PASSWORD", "RABBITMQ_PASSWORD",
    "INTERNAL_SERVICE_SECRET", "JWT_SECRET"]) {
    if (env[key]) text = text.replaceAll(env[key], "[REDACTED]");
  }
  text = text.replace(/\b(?:postgres(?:ql)?|amqps?|rediss?|https?):\/\/[^\s"'<>]+/gi, "[REDACTED_URL]");
  return text;
}

export function cloneCommittedSource(repository, clone, ref = "HEAD", run = (command, args, label, { cwd, capture = false } = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 60_000 });
  if (result.error || result.status !== 0) throw new Error(`${label} failed`);
  return capture ? result.stdout : "";
}) {
  const revision = run("git", ["rev-parse", "--verify", `${ref}^{commit}`], "Resolve committed source", { cwd: repository, capture: true }).trim();
  run("git", ["clone", "--quiet", "--no-hardlinks", "--no-checkout", "--", repository, clone],
    "Create clean local clone (no working-tree files or credentials)", { cwd: repository });
  run("git", ["checkout", "--quiet", "--detach", revision], "Checkout immutable revision", { cwd: clone });
  return revision;
}

export async function waitForProgress(check, { timeoutMs = 60_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const deadline = now() + timeoutMs;
  let lastError;
  do {
    try {
      const progress = await check();
      if (progress.chainReader?.status !== "caught-up" ||
        !Array.isArray(progress.consumers) || progress.consumers.length !== 6 ||
        progress.consumers.some((consumer) =>
          consumer.status !== "available" || !Number.isSafeInteger(consumer.consumers) || consumer.consumers < 1 ||
          consumer.ready !== 0 || consumer.unacknowledged !== 0)) {
        throw new Error("Every consumer must be available and drained, and chain projection caught up");
      }
      return progress;
    } catch (error) { lastError = error; }
    if (now() >= deadline) break;
    await sleep(Math.min(1000, deadline - now()));
  } while (now() < deadline);
  throw new Error(`Operator progress readiness timed out: ${lastError?.message}`);
}

export async function verifyDay4(options = {}, { repository = sourceRoot } = {}) {
  const { ref = "HEAD", keep = false, workingTree = false, paginationOnly = false, performanceOnly = false, queryPlansOnly = false } = options;
  if (workingTree && ref !== "HEAD") throw new Error("--working-tree cannot select a historical revision");
  const id = `${Date.now()}-${randomBytes(5).toString("hex")}`;
  const project = `todo-day4-verify-${id}`;
  const release = `day4-${id}`;
  const scratch = resolve(repository, ".verification", project);
  const clone = join(scratch, "source");
  let env = process.env;
  let compose;
  let stackAttempted = false;
  let evidence;
  const deadline = Date.now() + 30 * 60_000;
  const run = (command, args, label, { cwd = clone, capture = false, timeout = commandTimeoutMs } = {}) => {
    if (label) console.log(`=== ${label} ===`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Verification exceeded its 30-minute total deadline");
    const result = spawnSync(command, args, {
      cwd, env, encoding: "utf8", timeout: Math.min(timeout, remaining),
      maxBuffer: 16 * 1024 * 1024,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (result.error || result.status !== 0) {
      if (capture) {
        const diagnostic = redactVerificationOutput(`${result.stdout ?? ""}${result.stderr ?? ""}`, env);
        if (diagnostic.trim()) console.error(diagnostic.trim());
      }
      throw new Error(`${label ?? command} failed (${result.error?.code ?? result.status}); command deadline ${timeout}ms`);
    }
    return result.stdout ?? "";
  };
  const runRedacted = (command, args, label, timeout = commandTimeoutMs) => {
    console.log(`=== ${label} ===`);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Verification exceeded its 30-minute total deadline");
    const result = spawnSync(command, args, {
      cwd: clone, env, encoding: "utf8", timeout: Math.min(timeout, remaining), maxBuffer: 16 * 1024 * 1024,
    });
    const output = redactVerificationOutput(`${result.stdout ?? ""}${result.stderr ?? ""}`, env);
    if (output.trim()) console.log(output.trim());
    if (result.error || result.status !== 0) throw new Error(`${label} failed (${result.error?.code ?? result.status})`);
  };
  await mkdir(scratch, { recursive: true });
  try {
    const source = workingTree
      ? await snapshotCurrentSource(repository, clone)
      : { revision: cloneCommittedSource(repository, clone, ref, run), sourceKind: "committed-clean-clone" };
    const { revision } = source;
    for (const file of ["scripts/verify-operations.mjs", "scripts/day4.compose.yml", "scripts/day4-validation.Dockerfile",
      "scripts/setup-day4-chain.mjs", "scripts/rollback-release.mjs"]) {
      await readFile(join(clone, file));
    }
    await mkdir(join(scratch, "empty-mail-secrets"));
    await mkdir(join(scratch, "chain-secrets"));
    const writerKey = `0x${randomBytes(32).toString("hex")}`;
    await writeFile(join(scratch, "chain-secrets", "writer.key"), writerKey, { mode: 0o600 });
    await writeFile(join(scratch, "empty.env"), "", { mode: 0o600 });
    env = isolatedComposeEnvironment(verificationEnvironment(project, release, scratch, clone),
      clone, join(scratch, "empty.env"));
    env.CHAIN_WRITER_ADDRESS = privateKeyToAccount(writerKey).address;
    compose = ["compose", "--project-name", project, "--project-directory", clone,
      "--env-file", join(scratch, "empty.env"), "-f", join(clone, "docker-compose.yml"),
      "-f", join(clone, "scripts", "day4.compose.yml")];
    const dc = (args, label, settings) => run("docker", [...compose, ...args], label, settings);
    const config = JSON.parse(dc(["config", "--format", "json"], "Validate isolated Compose model", { capture: true }));
    assertIsolatedConfig(config, project, [clone, scratch]);
    const cleanupFile = join(scratch, "cleanup.compose.json");
    await writeFile(cleanupFile, JSON.stringify(cleanupComposeConfig(config, project), null, 2));
    console.log(`Source: ${source.sourceKind}; base revision: ${revision}; isolated project: ${project}; no host ports`);
    if (queryPlansOnly) {
      dc(["--profile", "verification", "build", "validation"], "Build production code and locked dependencies for query plans",
        { timeout: 1_200_000 });
      stackAttempted = true;
      dc(["up", "-d", "--wait", "--wait-timeout", "90", "evolution-postgres"], "Start dedicated query-plan PostgreSQL cluster");
      const queryPlans = parseLastJsonLine(dc([
        "--profile", "verification", "run", "--rm", "--no-deps", "-T",
        "-e", "QUERY_PLAN_VERIFY_ISOLATED=1", "validation", "node", "scripts/verify-query-plans.mjs",
      ], "PF-10 actual production SQL EXPLAIN ANALYZE", { capture: true, timeout: 900_000 }), "PF-10 query plans");
      assert.equal(queryPlans.passed, true);
      evidence = { result: "passed", scope: "PF-10", ...source, project,
        cleanCommittedSource: !workingTree, queryPlans };
      await writeFile(join(scratch, "result.json"), JSON.stringify(evidence, null, 2));
      console.log(`PF-10 passed: ${queryPlans.cases.length} cases; full SQL, parameters and plans saved in receipt`);
      return evidence;
    }
    for (const service of ["account-migrations", "todo-migrations", "account-service", "todo-service", "gateway"]) {
      dc(["build", service], `Build isolated ${service} image (one target at a time)`);
    }
    const todoImage = `multi-user-todo-platform-todo-service:${release}`;
    dc(["--profile", "verification", "build", "validation"], "Build Node 24 locked-dependency validation image");
    stackAttempted = true;
    dc(["--profile", "verification", "run", "--rm", "--no-deps", "-T", "validation", "npm", "run", "check"], "Lint, build and all unit tests");
    dc(["--profile", "verification", "run", "--rm", "--no-deps", "-T", "validation", "node", "--test",
      "scripts/__tests__/rollback-release.test.mjs", "scripts/__tests__/verify-day4.test.mjs"], "Operational verifier unit tests");
    dc(["--profile", "verification", "run", "--rm", "--no-deps", "-T", "validation", "npm", "run", "test:docs"], "API documentation verification");
    dc(["--profile", "verification", "run", "--rm", "--no-deps", "-T", "validation", "npm", "run", "verify:authorization"], "Authorization verification");
    dc(["up", "-d", "--no-build", "account-postgres", "todo-postgres", "redis", "rabbitmq", "mailpit",
      "account-migrations", "todo-migrations", "verification-chain", "evolution-postgres"], "Start disposable infrastructure and migrations");
    dc(["run", "--rm", "--no-deps", "-T", "todo-service", "node", "scripts/setup-day4-chain.mjs"],
      "Deploy and validate TaskHistory on isolated local chain", { timeout: 120_000 });
    dc(["up", "-d", "--no-build", "--wait", "--wait-timeout", "180"], "Start and health-check all replicas", { timeout: 240_000 });
    if (!performanceOnly) {
      dc(["--profile", "verification", "run", "--rm", "--no-deps", "-T", "validation", "node",
        "scripts/verify-evolution-schema.mjs"], "Execute all real migration reversals and previous-code HTTP traffic", { timeout: 240_000 });
    }
    dc(["exec", "-T", "gateway", "node", "-e",
      "fetch('http://127.0.0.1:3000/health/dependencies',{signal:AbortSignal.timeout(10000)}).then(async r=>{const b=await r.json();if(!r.ok||b.status!=='healthy')process.exit(1)}).catch(()=>process.exit(1))"],
    "Verify complete dependency health");
    if (!performanceOnly) {
      dc(["--profile", "verification", "run", "--rm", "--no-deps", "-T", "validation", "npm", "run", "test:e2e"], "Complete live E2E suite");
    }
    if (performanceOnly) {
      const runPerformance = (script, label, timeout) => parseLastJsonLine(dc([
        "--profile", "verification", "run", "--rm", "--no-deps", "-T",
        "-e", "PERFORMANCE_VERIFY_ISOLATED=1", "validation", "node", `scripts/${script}`,
      ], label, { capture: true, timeout }), label);
      const roundTrips = runPerformance("verify-round-trips.mjs", "PF-3 actual endpoint PostgreSQL round trips", 120_000);
      assert.equal(roundTrips.passed, true);
      const performance = runPerformance("verify-performance.mjs", "PF-4/PF-5 concurrent API latency and deliberate breach", 600_000);
      assert.equal(performance.passed, true);
      evidence = { result: "passed", scope: "PF-3/PF-4/PF-5", ...source, project,
        cleanCommittedSource: !workingTree, liveGatewayE2ePassed: false, roundTrips, performance };
      await writeFile(join(scratch, "result.json"), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify(evidence));
      return evidence;
    }
    if (paginationOnly) {
      const pagination = parseLastJsonLine(dc(["--profile", "verification", "run", "--rm", "--no-deps", "-T",
        "-e", `PF2_DATABASE_URL=${env.EV_DATABASE_URL}`, "validation", "node", "scripts/verify-pagination.mjs"],
      "Real PF-2 access/filter/direction timing matrix", { capture: true, timeout: 600_000 }),
      "Real PF-2 access/filter/direction timing matrix");
      assert.equal(pagination.passed, true);
      evidence = { result: "passed", scope: "PF-2", ...source, project, cleanCommittedSource: !workingTree,
        liveGatewayE2ePassed: true, pagination };
      await writeFile(join(scratch, "result.json"), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify(evidence));
      return evidence;
    }
    dc(["stop", "verification-chain"], "Stop isolated chain for real outage injection");
    try {
      dc(["exec", "-T", "todo-service", "node", "scripts/verify-chain-live.mjs", "--outage"],
        "Business operations while chain is unavailable");
    } finally {
      dc(["stop", "chain-writer"], "Pause writers before restoring RPC for crash injection");
      dc(["start", "verification-chain"], "Restart isolated chain");
    }
    let crash;
    try {
      crash = JSON.parse(dc(["exec", "-T", "-e", "CHAIN_SIGNER_KEY_FILE=/run/chain-secrets/writer.key", "todo-service",
        "node", "scripts/verify-chain-crash.mjs"], "Kill real writer after RPC broadcast before acknowledgement", { capture: true }));
    } finally {
      dc(["start", "chain-writer"], "Restart both deployed writers after crash injection");
    }
    dc(["exec", "-T", "todo-service", "node", "scripts/verify-chain-crash.mjs", "--recover", crash.transactionHash],
      "Reconcile durable transaction after process death", { timeout: 240_000 });
    dc(["exec", "-T", "todo-service", "node", "scripts/verify-chain-live.mjs"],
      "Real application chain pipeline, concurrent writers and replacement contracts", { timeout: 240_000 });
    for (const script of ["verify-mail-mode.mjs", "verify-notification-retry.mjs", "verify-notification-quota.mjs"]) {
      runRedacted("docker", [...compose, "exec", "-T", "-e", `DLQ_OPERATOR_ID=day4-verifier:${project}`,
        "account-service", "node", `apps/account-service/scripts/${script}`],
        `Sink-only notification verification: ${script}`, 120_000);
    }
    dc(["exec", "-T", "account-service", "node", "apps/account-service/scripts/verify-workspace-concurrency.mjs"], "Workspace PostgreSQL concurrency proof");
    for (let pass = 1; pass <= 2; pass++) {
      dc(["exec", "-T", "todo-service", "sh", "-c",
        'node apps/todo-service/scripts/backfill-workspaces.mjs --account-url http://account-service:3001 --internal-key "$INTERNAL_SERVICE_SECRET"'],
      `Repeatable workspace backfill dry-run ${pass}`);
      dc(["exec", "-T", "todo-service", "npm", "run", "rebuild:chain-projection", "-w", "@todo/todo-service"], `Repeatable chain projection rebuild ${pass}`);
    }
    const progress = await waitForProgress(() => JSON.parse(dc([
      "exec", "-T", "todo-service", "node", "apps/todo-service/scripts/progress-status.mjs", "--require-ready",
    ], undefined, { capture: true, timeout: 20_000 })));
    console.log(JSON.stringify({ check: "ops:progress", result: "passed", ...progress }));
    runRedacted(process.execPath, [join(clone, "scripts", "verify-operations.mjs")], "Operator replay, DLQ and progress rehearsal");
    const finalProgress = await waitForProgress(() => JSON.parse(dc([
      "exec", "-T", "todo-service", "node", "apps/todo-service/scripts/progress-status.mjs", "--require-ready",
    ], undefined, { capture: true, timeout: 20_000 })));
    console.log(JSON.stringify({ check: "ops:progress-after-restart", result: "passed", ...finalProgress }));
    if (Date.now() >= deadline) throw new Error("Verification exceeded its 30-minute command budget");
    const rollback = await verifyRollback({ sourceImage: todoImage, cwd: clone, env });
    evidence = { result: "passed", ...source, project, cleanCommittedSource: !workingTree,
      isolatedLocalChain: true, sinkOnlyMail: true, mailModeRetryQuotaVerified: true,
      progressVerifiedAfterConsumerRestart: true, rollback };
    await writeFile(join(scratch, "result.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
    return evidence;
  } finally {
    let cleanupError;
    if (compose && stackAttempted && !keep) {
      // Cleanup has its own budget even if verification exhausted the total deadline.
      const result = spawnSync("docker", ["compose", "--project-name", project, "-f", join(scratch, "cleanup.compose.json"),
        "down", "--volumes", "--remove-orphans"], { cwd: clone, env, stdio: "inherit", timeout: 120_000 });
      if (result.error || result.status !== 0) cleanupError = new Error(`Cleanup failed for isolated project ${project}; retained ${scratch}`);
    }
    if (!keep) {
      if (compose) {
        const aliases = ["gateway", "account-service", "todo-service"].map((image) => `multi-user-todo-platform-${image}:${release}`);
        aliases.push(...["account-migrations", "todo-migrations", "validation"].map((image) => `${project}-${image}`));
        for (const image of aliases) {
          spawnSync("docker", ["image", "rm", image],
            { env, encoding: "utf8", timeout: 30_000 });
        }
      }
      // Keep a non-secret result outside the deleted clone; never retain generated credentials.
      if (evidence) await writeFile(join(repository, ".verification", `${project}-result.json`), JSON.stringify(evidence, null, 2));
      if (!cleanupError) await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } else {
      console.log(`--keep: isolated stack/clone retained at ${scratch}. Cleanup: docker compose --project-name ${project} -f "${join(scratch, "cleanup.compose.json")}" down --volumes --remove-orphans`);
    }
    if (cleanupError) throw cleanupError;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDay4(parseOptions(process.argv.slice(2))).catch((error) => {
    console.error(`Day 4 verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
