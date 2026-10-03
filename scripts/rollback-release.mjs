import { spawnSync } from "node:child_process";

const serviceImages = {
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
};

function parseArguments(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!["--service", "--current", "--release"].includes(name)) {
      throw new Error(`Unknown argument: ${name}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--") || options.has(name)) {
      throw new Error(`${name} requires one value and may only be specified once`);
    }
    options.set(name, value);
    index += 1;
  }

  const service = options.get("--service");
  const current = options.get("--current");
  const release = options.get("--release");
  const validTag = (tag) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(tag ?? "");
  if (!service || !serviceImages[service] || !validTag(current) || !validTag(release) || current === release) {
    throw new Error(
      "Usage: rollback-release.mjs --service <stateless-compose-service> --current <current-tag> --release <previous-tag>",
    );
  }

  return { service, current, release };
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    shell: process.platform === "win32" && command === "docker",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `${command} failed with exit code ${result.status}`);
  }
  return result.stdout ?? "";
}

function assertImageExists(image) {
  run("docker", ["image", "inspect", image]);
}

async function verifyService(service) {
  const healthPath = {
    gateway: "http://127.0.0.1:3000/health",
    "account-service": "http://127.0.0.1:3001/health",
    "todo-service": "http://127.0.0.1:3002/health/live",
  }[service];

  if (healthPath) {
    const probe = `fetch('${healthPath}').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))`;
    run("docker", ["compose", "exec", "-T", "--index", "1", service, "node", "-e", probe]);
    return true;
  }

  const runningServices = run("docker", ["compose", "ps", "--status", "running", "--services"])
    .split(/\r?\n/)
    .map((name) => name.trim());
  return runningServices.includes(service);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const operatorId = process.env.ROLLBACK_OPERATOR_ID?.trim();
  if (!operatorId || operatorId.length > 100) {
    throw new Error("ROLLBACK_OPERATOR_ID must identify the operator (1-100 characters)");
  }

  const image = serviceImages[options.service];
  assertImageExists(`${image}:${options.release}`);
  assertImageExists(`${image}:${options.current}`);

  const applyRelease = async (release) => {
    const env = { ...process.env, APP_RELEASE_ID: release };
    run("docker", [
      "compose", "up", "-d", "--no-build", "--no-deps",
      "--scale", `${options.service}=2`, options.service,
    ], env);
  };

  await applyRelease(options.release);
  if (!(await verifyService(options.service))) {
    await applyRelease(options.current);
    throw new Error(`Rollback health check failed; restored current release ${options.current}`);
  }

  console.log(JSON.stringify({
    result: "rolled-back",
    service: options.service,
    from: options.current,
    to: options.release,
    operatorId,
    databaseChanged: false,
    chainStateChanged: false,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Release rollback failed");
  process.exitCode = 1;
});