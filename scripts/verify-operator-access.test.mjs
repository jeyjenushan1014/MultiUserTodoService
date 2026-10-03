import assert from "node:assert/strict";
import test from "node:test";

import { parseScratchDatabaseUrl } from "./verify-operator-access.mjs";

test("accepts only loopback OP-8 scratch databases", () => {
  assert.deepEqual(
    parseScratchDatabaseUrl("postgres://operator:placeholder@127.0.0.1:5432/op8_scratch_todo_rehearsal"),
    {
      connectionString: "postgres://operator:placeholder@127.0.0.1:5432/op8_scratch_todo_rehearsal",
      databaseName: "op8_scratch_todo_rehearsal",
      service: "todo",
      target: "loopback",
    },
  );
  assert.equal(
    parseScratchDatabaseUrl("postgres://operator@localhost/op8_scratch_account_demo").service,
    "account",
  );
  assert.equal(
    parseScratchDatabaseUrl("postgres://operator@[::1]/op8_scratch_todo_demo").service,
    "todo",
  );
});

test("refuses absent, malformed, remote, live, and option-overridden database URLs", () => {
  const unsafeTargets = [
    undefined,
    "",
    "not a URL",
    "postgres://operator@example.test/op8_scratch_todo_demo",
    "postgres://operator@127.0.0.1/account_db",
    "postgres://operator@127.0.0.1/todo_db",
    "postgres://operator@127.0.0.1/op8_scratch_todo_demo?host=example.test",
    "postgres://operator@127.0.0.1/op8_scratch_todo_demo#fragment",
  ];

  for (const target of unsafeTargets) {
    assert.throws(() => parseScratchDatabaseUrl(target), /OP8_SCRATCH_DATABASE_URL/);
  }
});

test("accepts isolated Compose scratch URLs only with an explicit project-bound opt-in", () => {
  const isolatedEnv = {
    OP8_CONTAINER_REHEARSAL: "1",
    OPERATIONS_REHEARSAL_ISOLATED: "1",
    DAY4_COMPOSE_PROJECT: "todo-day4-verify-op10-1234",
    COMPOSE_PROJECT_NAME: "todo-day4-verify-op10-1234",
  };
  assert.deepEqual(
    parseScratchDatabaseUrl(
      "postgres://operator:secret@account-postgres:5432/op10_scratch_ci_account",
      isolatedEnv,
    ),
    {
      connectionString: "postgres://operator:secret@account-postgres:5432/op10_scratch_ci_account",
      databaseName: "op10_scratch_ci_account",
      service: "account",
      target: "isolated-compose",
    },
  );
  assert.equal(
    parseScratchDatabaseUrl(
      "postgres://operator@todo-postgres/op8_scratch_ci_todo",
      isolatedEnv,
    ).service,
    "todo",
  );
});

test("container target opt-in rejects mismatched project, host, service suffix, and URL overrides", () => {
  const isolatedEnv = {
    OP8_CONTAINER_REHEARSAL: "1",
    OPERATIONS_REHEARSAL_ISOLATED: "1",
    DAY4_COMPOSE_PROJECT: "todo-day4-verify-op10-1234",
    COMPOSE_PROJECT_NAME: "todo-day4-verify-op10-1234",
  };
  const unsafeTargets = [
    ["postgres://operator@account-postgres/op10_scratch_ci_account", { ...isolatedEnv, COMPOSE_PROJECT_NAME: "todo-platform" }],
    ["postgres://operator@account-postgres/op10_scratch_ci_account", { ...isolatedEnv, DAY4_COMPOSE_PROJECT: "todo-platform" }],
    ["postgres://operator@todo-postgres/op10_scratch_ci_account", isolatedEnv],
    ["postgres://operator@account-postgres/account_db", isolatedEnv],
    ["postgres://operator@account-postgres/op10_scratch_ci_todo", isolatedEnv],
    ["postgres://operator@localhost/op10_scratch_ci_account", isolatedEnv],
    ["postgres://operator@account-postgres/op10_scratch_ci_account?host=localhost", isolatedEnv],
    ["postgres://operator@account-postgres/op10_scratch_ci_account#fragment", isolatedEnv],
    ["postgres://operator@account-postgres:5433/op10_scratch_ci_account", isolatedEnv],
  ];

  for (const [target, env] of unsafeTargets) {
    assert.throws(() => parseScratchDatabaseUrl(target, env), /Container rehearsal|PostgreSQL URL/);
  }

  assert.throws(
    () => parseScratchDatabaseUrl("postgres://operator@account-postgres/op10_scratch_ci_account", {
      OPERATIONS_REHEARSAL_ISOLATED: "1",
      DAY4_COMPOSE_PROJECT: isolatedEnv.DAY4_COMPOSE_PROJECT,
      COMPOSE_PROJECT_NAME: isolatedEnv.COMPOSE_PROJECT_NAME,
    }),
    /loopback|OP8_CONTAINER_REHEARSAL/,
    "container service names must not be accepted without explicit opt-in",
  );
  assert.throws(
    () => parseScratchDatabaseUrl("postgres://operator@account-postgres/op10_scratch_ci_account", {
      ...isolatedEnv,
      OPERATIONS_REHEARSAL_ISOLATED: "0",
    }),
    /OPERATIONS_REHEARSAL_ISOLATED=1/,
  );
});
