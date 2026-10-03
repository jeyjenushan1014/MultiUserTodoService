import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const serviceImages = {
  gateway: "multi-user-todo-platform-gateway",
  "account-service": "multi-user-todo-platform-account-service",
  "account-outbox-worker": "multi-user-todo-platform-account-service",
  "workflow-worker": "multi-user-todo-platform-account-service",
  "account-cleanup-worker": "multi-user-todo-platform-account-service",
  "account-notification-consumer": "multi-user-todo-platform-account-service",
  "todo-service": "multi-user-todo-platform-todo-service",
  "todo-outbox-worker": "multi-user-todo-platform-todo-service",
  "todo-owner-consumer": "multi-user-todo-platform-todo-service",
  "todo-history-worker": "multi-user-todo-platform-todo-service",
  "todo-cleanup-worker": "multi-user-todo-platform-todo-service",
  "chain-writer": "multi-user-todo-platform-todo-service",
  "chain-indexer": "multi-user-todo-platform-todo-service",
};

export function parseArguments(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!["--service", "--current", "--release"].includes(name)) throw new Error(`Unknown argument: ${name}`);
    if (!value || value.startsWith("--") || options.has(name)) throw new Error(`${name} requires one value`);
    options.set(name, value);
  }
  const service = options.get("--service");
  const current = options.get("--current");
  const release = options.get("--release");
  const validTag = (tag) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(tag ?? "");
  if (!Object.hasOwn(serviceImages, service ?? "") || !validTag(current) || !validTag(release) || current === release) {
    throw new Error("Usage: rollback-release.mjs --service <stateless-compose-service> --current <current-tag> --release <previous-tag>");
  }
  return { service, current, release };
}

function docker(args, env) {
  const result = spawnSync("docker", args, { encoding: "utf8", env, timeout: 120_000 });
  if (result.error || result.status !== 0) {
    // Compose diagnostics can include interpolated credentials; never print them.
    throw new Error(`Docker ${args.slice(0, 2).join(" ")} failed (${result.error?.code ?? result.status})`);
  }
  return result.stdout ?? "";
}

export async function rollbackRelease(options, {
  env = process.env,
  run = docker,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  timeoutMs = Number(env.ROLLBACK_HEALTH_TIMEOUT_MS ?? 120_000),
} = {}) {
  const { service, current, release } = parseArguments([
    "--service", options.service, "--current", options.current, "--release", options.release,
  ]);
  const operatorId = env.ROLLBACK_OPERATOR_ID?.trim();
  if (!operatorId || operatorId.length > 100 || /[\r\n]/.test(operatorId)) {
    throw new Error("ROLLBACK_OPERATOR_ID must identify the operator (1-100 characters)");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error("Invalid rollback health timeout");
  const image = serviceImages[service];
  const currentRef = `${image}:${current}`;
  const targetRef = `${image}:${release}`;
  const invoke = (args, tag = current) => run(args, { ...env, APP_RELEASE_ID: tag });
  const inspectImage = (ref) => JSON.parse(invoke(["image", "inspect", ref]))[0].Id;
  const currentId = inspectImage(currentRef);
  const targetId = inspectImage(targetRef);
  for (const [tag, ref] of [[current, currentRef], [release, targetRef]]) {
    const config = JSON.parse(invoke(["compose", "config", "--format", "json"], tag));
    if (config.services?.[service]?.image !== ref) throw new Error(`Compose must select ${ref} for ${service}`);
  }
  const containers = () => {
    const ids = invoke(["compose", "ps", "--all", "--quiet", service]).trim().split(/\s+/).filter(Boolean);
    return ids.length ? JSON.parse(invoke(["inspect", ...ids])) : [];
  };
  const before = containers();
  if (!before.length || before.some((container) =>
    !container.State.Running || container.Config.Image !== currentRef || container.Image !== currentId)) {
    throw new Error("Refusing rollback: every existing replica must be running the declared current image");
  }
  const replicas = before.length;
  const healthUrl = {
    gateway: "http://127.0.0.1:3000/health",
    "account-service": "http://127.0.0.1:3001/health",
    "todo-service": "http://127.0.0.1:3002/health/live",
  }[service];
  const verify = async (tag, ref, id) => {
    const deadline = now() + timeoutMs;
    let lastError;
    do {
      try {
        const actual = containers();
        if (actual.length !== replicas) throw new Error("Replica count changed");
        for (const container of actual) {
          if (!container.State.Running || container.Config.Image !== ref || container.Image !== id) {
            throw new Error("Replica is not running the expected retained image");
          }
          if (container.State.Health && container.State.Health.Status !== "healthy") {
            throw new Error("Replica healthcheck is not healthy");
          }
          if (healthUrl) {
            const probe = `fetch(${JSON.stringify(healthUrl)}, {signal: AbortSignal.timeout(5000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))`;
            invoke(["exec", container.Id, "node", "-e", probe], tag);
          }
        }
        return actual.map((container) => container.Id);
      } catch (error) { lastError = error; }
      if (now() >= deadline) break;
      await sleep(Math.min(1000, deadline - now()));
    } while (now() < deadline);
    throw new Error(`All-replica verification failed: ${lastError?.message}`);
  };
  const apply = (tag) => invoke([
    "compose", "up", "-d", "--no-build", "--pull", "never", "--no-deps",
    "--scale", `${service}=${replicas}`, service,
  ], tag);
  let ids;
  try {
    apply(release);
    ids = await verify(release, targetRef, targetId);
  } catch (error) {
    try {
      apply(current);
      await verify(current, currentRef, currentId);
    } catch (restoreError) {
      throw new Error(`Rollback failed (${error.message}); current release restoration FAILED (${restoreError.message}). Operator intervention required.`);
    }
    throw new Error(`Rollback failed (${error.message}); restored and verified all ${replicas} current-release replicas`);
  }
  return {
    result: "rolled-back", service, from: current, to: release, operatorId, replicas,
    imageReference: targetRef, imageId: targetId, containers: ids,
    databaseChanged: false, chainStateChanged: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  rollbackRelease(parseArguments(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
