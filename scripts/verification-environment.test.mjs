import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolatedHostEnvironment, mailVerificationEnvironment } from "./verification-environment.mjs";

const project = "todo-mail-verify-0123456789";
const scratch = join(tmpdir(), `${project}-empty-secrets`);

test("shared verification host environment excludes service secrets and selectors", () => {
  assert.deepEqual(isolatedHostEnvironment({
    PATH: "tools", DOCKER_CONTEXT: "approved", ACCOUNT_DATABASE_URL: "live",
    COMPOSE_FILE: "live.yml", NODE_OPTIONS: "--require=untrusted", MAIL_PROVIDER_PASSWORD: "live",
  }), { PATH: "tools", DOCKER_CONTEXT: "approved" });
});

test("mail rehearsal generates consistent private URLs instead of inheriting parent credentials", () => {
  const env = mailVerificationEnvironment(project, scratch, {
    PATH: "tools", COMPOSE_FILE: "live.yml", COMPOSE_PROJECT_NAME: "live",
    ACCOUNT_DATABASE_URL: "postgres://live:secret@external/account",
    TODO_DATABASE_URL: "postgres://live:secret@external/todo",
    RABBITMQ_URL: "amqp://live:secret@external",
    CHAIN_SECRET_DIR: "live", MAIL_PROVIDER_HOST: "external", APP_RELEASE_ID: "live",
  });
  assert.equal(env.PATH, "tools");
  assert.equal(env.COMPOSE_FILE, undefined);
  assert.equal(env.COMPOSE_PROJECT_NAME, project);
  assert.equal(env.APP_RELEASE_ID, project);
  for (const service of ["ACCOUNT", "TODO"]) {
    const url = new URL(env[`${service}_DATABASE_URL`]);
    assert.equal(url.hostname, `${service.toLowerCase()}-postgres`);
    assert.equal(url.username, env[`${service}_POSTGRES_USER`]);
    assert.equal(url.password, env[`${service}_POSTGRES_PASSWORD`]);
    assert.equal(url.pathname, `/${env[`${service}_POSTGRES_DB`]}`);
    assert.match(url.password, /^[a-f0-9]{64}$/);
  }
  const broker = new URL(env.RABBITMQ_URL);
  assert.equal(broker.hostname, "rabbitmq");
  assert.equal(broker.username, env.RABBITMQ_USER);
  assert.equal(broker.password, env.RABBITMQ_PASSWORD);
  assert.equal(new URL(env.REDIS_URL).password, env.REDIS_PASSWORD);
  assert.equal(env.MAIL_TEST_SINK_ONLY, "true");
  assert.equal(env.MAIL_PROVIDER_HOST, "");
  assert.equal(env.CHAIN_SECRET_DIR, scratch);
  assert.equal(env.CONTAINER_CHAIN_RPC_URL, "http://127.0.0.1:1");
  assert.notEqual(env.JWT_SECRET, mailVerificationEnvironment(project, scratch).JWT_SECRET);
});

test("mail rehearsal refuses nonisolated projects and unrelated scratch directories", () => {
  assert.throws(() => mailVerificationEnvironment("live", scratch), /own generated project/);
  assert.throws(() => mailVerificationEnvironment(project, tmpdir()), /matching absolute scratch/);
  assert.throws(() => mailVerificationEnvironment(project, `${project}-empty-secrets`), /absolute scratch/);
});
