#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

import { runOperatorCommand } from "./operator-access.mjs";

const ROLE_ATTRIBUTES = [
  "rolcanlogin",
  "rolsuper",
  "rolcreatedb",
  "rolcreaterole",
  "rolbypassrls",
  "rolinherit",
];

export function parseScratchDatabaseUrl(value, env = process.env) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("OP8_SCRATCH_DATABASE_URL is required; no environment file is loaded");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OP8_SCRATCH_DATABASE_URL must be a valid PostgreSQL URL");
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !databaseName || url.search || url.hash) {
    throw new Error("OP8_SCRATCH_DATABASE_URL must be a PostgreSQL URL without query parameters or fragments");
  }

  if (env.OP8_CONTAINER_REHEARSAL === "1") {
    if (env.OPERATIONS_REHEARSAL_ISOLATED !== "1") {
      throw new Error("Container rehearsal requires OPERATIONS_REHEARSAL_ISOLATED=1");
    }
    const project = env.DAY4_COMPOSE_PROJECT;
    if (
      !project
      || project !== env.COMPOSE_PROJECT_NAME
      || !project.startsWith("todo-day4-verify-")
    ) {
      throw new Error(
        "Container rehearsal requires matching DAY4_COMPOSE_PROJECT and COMPOSE_PROJECT_NAME beginning todo-day4-verify-",
      );
    }

    const databaseMatch = /^op(?:8|10)_scratch_[a-z0-9_]+_(account|todo)$/.exec(databaseName);
    const service = databaseMatch?.[1];
    if (!service || url.hostname !== `${service}-postgres` || (url.port && url.port !== "5432")) {
      throw new Error(
        "Container rehearsal URL must use account-postgres or todo-postgres and an OP-8/OP-10 scratch database ending in the matching _account or _todo suffix",
      );
    }

    return { connectionString: url.toString(), databaseName, service, target: "isolated-compose" };
  }

  const serviceMatch = /^op8_scratch_(account|todo)_[a-z0-9_]+$/.exec(databaseName);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !serviceMatch) {
    throw new Error(
      "OP8_SCRATCH_DATABASE_URL must target loopback and an op8_scratch_account_* or op8_scratch_todo_* database; container targets require OP8_CONTAINER_REHEARSAL=1",
    );
  }

  return { connectionString: url.toString(), databaseName, service: serviceMatch[1], target: "loopback" };
}

async function verifyRoles(client, service) {
  const names = [
    `${service}_routine_operator`,
    `${service}_break_glass_operator`,
    `${service}_operator_auditor`,
  ];
  const result = await client.query(
    `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit
       FROM pg_catalog.pg_roles
      WHERE rolname = ANY($1::text[])`,
    [names],
  );
  assert.equal(result.rowCount, names.length, "operator roles are missing; apply the service migration to this scratch database");

  for (const role of result.rows) {
    for (const attribute of ROLE_ATTRIBUTES) {
      assert.equal(role[attribute], false, `${role.rolname} must have ${attribute}=false`);
    }
  }
}

async function verifyDataPrivileges(client, service) {
  const roleNames = [
    `${service}_routine_operator`,
    `${service}_break_glass_operator`,
    `${service}_operator_auditor`,
  ];
  const result = await client.query(
    `SELECT c.relname,
         has_table_privilege($1::name, c.oid, 'SELECT') AS routine_select,
         has_table_privilege($1::name, c.oid, 'INSERT') AS routine_insert,
         has_table_privilege($1::name, c.oid, 'UPDATE') AS routine_update,
         has_table_privilege($1::name, c.oid, 'DELETE') AS routine_delete,
         has_table_privilege($1::name, c.oid, 'TRUNCATE') AS routine_truncate,
         has_table_privilege($1::name, c.oid, 'REFERENCES') AS routine_references,
         has_table_privilege($1::name, c.oid, 'TRIGGER') AS routine_trigger,
         has_table_privilege($2::name, c.oid, 'SELECT') AS break_glass_select,
         has_table_privilege($2::name, c.oid, 'INSERT') AS break_glass_insert,
         has_table_privilege($2::name, c.oid, 'UPDATE') AS break_glass_update,
         has_table_privilege($2::name, c.oid, 'DELETE') AS break_glass_delete,
         has_table_privilege($2::name, c.oid, 'TRUNCATE') AS break_glass_truncate,
         has_table_privilege($2::name, c.oid, 'REFERENCES') AS break_glass_references,
         has_table_privilege($2::name, c.oid, 'TRIGGER') AS break_glass_trigger,
         has_table_privilege($3::name, c.oid, 'SELECT') AS auditor_select,
         has_table_privilege($3::name, c.oid, 'INSERT') AS auditor_insert,
         has_table_privilege($3::name, c.oid, 'UPDATE') AS auditor_update,
         has_table_privilege($3::name, c.oid, 'DELETE') AS auditor_delete,
         has_table_privilege($3::name, c.oid, 'TRUNCATE') AS auditor_truncate,
         has_table_privilege($3::name, c.oid, 'REFERENCES') AS auditor_references,
         has_table_privilege($3::name, c.oid, 'TRIGGER') AS auditor_trigger
       FROM pg_catalog.pg_class AS c
       JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')`,
    roleNames,
  );
  const auditRelation = result.rows.find((row) => row.relname === "operator_access_audit");
  assert.ok(auditRelation, "operator_access_audit table is missing; apply the service migration to this scratch database");

  for (const relation of result.rows) {
    for (const privilege of ["select", "insert", "update", "delete", "truncate", "references", "trigger"]) {
      assert.equal(relation[`routine_${privilege}`], false, `${roleNames[0]} must not ${privilege} ${relation.relname}`);
      assert.equal(relation[`break_glass_${privilege}`], false, `${roleNames[1]} must not ${privilege} ${relation.relname} directly`);
      assert.equal(
        relation[`auditor_${privilege}`],
        false,
        `${roleNames[2]} must use redacted audit functions instead of direct table access`,
      );
    }
  }

  const sequences = await client.query(
    `SELECT c.relname,
            has_sequence_privilege($1::name, c.oid, 'USAGE') AS routine_usage,
            has_sequence_privilege($1::name, c.oid, 'SELECT') AS routine_select,
            has_sequence_privilege($1::name, c.oid, 'UPDATE') AS routine_update,
            has_sequence_privilege($2::name, c.oid, 'USAGE') AS break_glass_usage,
            has_sequence_privilege($2::name, c.oid, 'SELECT') AS break_glass_select,
            has_sequence_privilege($2::name, c.oid, 'UPDATE') AS break_glass_update,
            has_sequence_privilege($3::name, c.oid, 'USAGE') AS auditor_usage,
            has_sequence_privilege($3::name, c.oid, 'SELECT') AS auditor_select,
            has_sequence_privilege($3::name, c.oid, 'UPDATE') AS auditor_update
       FROM pg_catalog.pg_class AS c
       JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S'`,
    roleNames,
  );
  for (const sequence of sequences.rows) {
    for (const privilege of ["usage", "select", "update"]) {
      assert.equal(sequence[`routine_${privilege}`], false, `${roleNames[0]} must not access sequence ${sequence.relname}`);
      assert.equal(sequence[`break_glass_${privilege}`], false, `${roleNames[1]} must not access sequence ${sequence.relname} directly`);
      assert.equal(sequence[`auditor_${privilege}`], false, `${roleNames[2]} must not access sequence ${sequence.relname}`);
    }
  }

  const databasePrivileges = await client.query(
    `SELECT has_database_privilege($1::name, current_database(), 'CREATE') AS routine_create,
            has_database_privilege($2::name, current_database(), 'CREATE') AS break_glass_create,
            has_database_privilege($3::name, current_database(), 'CREATE') AS auditor_create,
            has_schema_privilege($1::name, 'public', 'CREATE') AS routine_schema_create,
            has_schema_privilege($2::name, 'public', 'CREATE') AS break_glass_schema_create,
            has_schema_privilege($3::name, 'public', 'CREATE') AS auditor_schema_create`,
    roleNames,
  );
  for (const [name, value] of Object.entries(databasePrivileges.rows[0])) {
    assert.equal(value, false, `${name} must be denied`);
  }
}

async function verifyFunctionPrivileges(client, service) {
  const openFunction = `public.begin_${service}_break_glass(uuid, text, text, text, text, timestamp with time zone)`;
  const closeFunction = `public.close_${service}_break_glass(uuid, uuid, text, text)`;
  const routineFunctions = service === "account"
    ? [
      "public.operator_mail_mode_status()",
      "public.operator_mail_mode_set_sink()",
      "public.operator_mail_mode_audit(integer)",
      "public.operator_access_audit_recent(integer)",
    ]
    : [
      "public.operator_chain_projection_progress()",
      "public.operator_access_audit_recent(integer)",
    ];
  const routineRole = `${service}_routine_operator`;
  const result = await client.query(
    `SELECT has_function_privilege($1::name, $3::regprocedure, 'EXECUTE') AS routine_open,
            has_function_privilege($2::name, $3::regprocedure, 'EXECUTE') AS break_glass_open,
            has_function_privilege($5::name, $3::regprocedure, 'EXECUTE') AS auditor_open,
            has_function_privilege($1::name, $4::regprocedure, 'EXECUTE') AS routine_close,
            has_function_privilege($2::name, $4::regprocedure, 'EXECUTE') AS break_glass_close,
            has_function_privilege($5::name, $4::regprocedure, 'EXECUTE') AS auditor_close,
            has_function_privilege($1::name, $6::regprocedure, 'EXECUTE') AS routine_scoped_function,
            has_function_privilege($5::name, $6::regprocedure, 'EXECUTE') AS auditor_scoped_function`,
    [
      `${service}_routine_operator`,
      `${service}_break_glass_operator`,
      openFunction,
      closeFunction,
      `${service}_operator_auditor`,
      routineFunctions[0],
    ],
  );
  const privileges = result.rows[0];
  assert.equal(privileges.routine_open, false);
  assert.equal(privileges.routine_close, false);
  assert.equal(privileges.break_glass_open, true);
  assert.equal(privileges.break_glass_close, true);
  assert.equal(privileges.auditor_open, false);
  assert.equal(privileges.auditor_close, false);
  assert.equal(privileges.routine_scoped_function, true, `${routineRole} must access its first scoped routine`);
  assert.equal(privileges.auditor_scoped_function, false);

  for (const functionName of routineFunctions.slice(1)) {
    const grant = await client.query(
      "SELECT has_function_privilege($1::name, $2::regprocedure, 'EXECUTE') AS allowed",
      [routineRole, functionName],
    );
    assert.equal(grant.rows[0].allowed, true, `${routineRole} must execute ${functionName}`);
  }

  const auditorFunction = await client.query(
    "SELECT has_function_privilege($1::name, $2::regprocedure, 'EXECUTE') AS allowed",
    [`${service}_operator_auditor`, `public.operator_access_audit_recent(integer)`],
  );
  assert.equal(auditorFunction.rows[0].allowed, true);
}

async function verifyLoginOperator(client, target, breakGlassOperatorId) {
  const operatorDatabaseVariable = target.service === "account"
    ? "ACCOUNT_OPERATOR_DATABASE_URL"
    : "TODO_OPERATOR_DATABASE_URL";
  await assert.rejects(
    runOperatorCommand(
      [target.service, target.service === "account" ? "mail-status" : "chain-progress"],
      { [operatorDatabaseVariable]: target.connectionString },
    ),
    /not a dedicated routine operator identity/i,
    "application/database-owner connection must not be accepted by the operator CLI",
  );

  const roleName = `op8_test_${target.service}_${randomBytes(8).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  const loginUrl = new URL(target.connectionString);
  loginUrl.username = roleName;
  loginUrl.password = password;

  await client.query(`CREATE ROLE "${roleName}" LOGIN PASSWORD '${password}'`);
  try {
    await client.query(`GRANT ${target.service}_routine_operator TO "${roleName}"`);
    if (target.service === "account") {
      await client.query("UPDATE public.notification_mail_settings SET mode = 'external' WHERE id = 1");
    }
    const operator = new pg.Client({
      connectionString: loginUrl.toString(),
      application_name: "op8-login-rehearsal",
      connectionTimeoutMillis: 5000,
    });
    try {
      await operator.connect();
      const identity = await operator.query("SELECT session_user::text AS login, current_user::text AS active");
      assert.equal(identity.rows[0].login, roleName);
      assert.equal(identity.rows[0].active, roleName, "routine functions must work without SET ROLE");

      await assert.rejects(
        operator.query("SELECT * FROM public.operator_access_audit LIMIT 0"),
        /permission denied/i,
        "login operator must not read audit rows directly",
      );
      await assert.rejects(
        operator.query("UPDATE public.operator_access_audit SET outcome = 'aborted' WHERE false"),
        /permission denied/i,
        "login operator must not write audit rows directly",
      );

      if (target.service === "account") {
        return await verifyAccountLoginOperator(operator, roleName, loginUrl.toString(), breakGlassOperatorId);
      } else {
        return await verifyTodoLoginOperator(operator, roleName, loginUrl.toString(), breakGlassOperatorId);
      }
    } finally {
      await operator.end();
    }
  } finally {
    await client.query(`DROP ROLE IF EXISTS "${roleName}"`);
  }
}

async function verifyAccountLoginOperator(operator, loginName, connectionString, breakGlassOperatorId) {
  await assert.rejects(
    operator.query("SELECT * FROM public.notification_mail_settings LIMIT 0"),
    /permission denied/i,
    "login operator must not read the mail configuration table directly",
  );
  await assert.rejects(
    operator.query("UPDATE public.notification_mail_settings SET mode = 'external' WHERE false"),
    /permission denied/i,
    "login operator must not write the mail configuration table directly",
  );
  const env = { ACCOUNT_OPERATOR_DATABASE_URL: connectionString };
  const status = await runOperatorCommand(["account", "mail-status"], env);
  assert.equal(status.operatorId, loginName);
  assert.equal(status.result[0]?.configured_mode, "external");
  const changed = await runOperatorCommand(["account", "mail-sink"], env);
  assert.equal(changed.operatorId, loginName);
  assert.equal(changed.result[0]?.previous_mode, "external");
  assert.equal(changed.result[0]?.configured_mode, "sink");
  assert.equal(changed.result[0]?.changed, true);
  assert.equal(changed.result[0]?.changed_by, loginName, "mail mode audit identity must come from session_user");

  const unchanged = await runOperatorCommand(["account", "mail-sink"], env);
  assert.equal(unchanged.result[0]?.changed, false, "repeating the safe sink command must be idempotent");
  const mailAudit = await runOperatorCommand(["account", "mail-audit", "10"], env);
  assert.ok(
    mailAudit.result.some((row) => row.changed_by === loginName && row.previous_mode === "external" && row.new_mode === "sink"),
    "scoped mail audit must record the login role that changed mode",
  );
  assert.deepEqual(
    Object.keys(mailAudit.result[0] ?? {}).sort(),
    ["changed_by", "changed_at", "new_mode", "previous_mode"].sort(),
    "mail audit result must omit unrelated delivery data",
  );
  await assert.rejects(
    operator.query("SELECT * FROM public.operator_mail_mode_audit($1)", [51]),
    /audit limit must be between 1 and 50/i,
  );
  const accessAudit = await runOperatorCommand(["account", "access-audit", "50"], env);
  verifyRedactedAccessAudit(accessAudit.result, loginName, breakGlassOperatorId);
  return ["mail-status", "mail-sink", "mail-audit", "access-audit"];
}

async function verifyTodoLoginOperator(operator, loginName, connectionString, breakGlassOperatorId) {
  await assert.rejects(
    operator.query("UPDATE public.chain_projection_checkpoints SET last_scanned_block = last_scanned_block WHERE false"),
    /permission denied/i,
    "login operator must not write chain projection rows directly",
  );
  const env = { TODO_OPERATOR_DATABASE_URL: connectionString };
  const progress = await runOperatorCommand(["todo", "chain-progress"], env);
  assert.equal(progress.operatorId, loginName);
  const projectionColumns = await operator.query("SELECT * FROM public.operator_chain_projection_progress()");
  assert.deepEqual(
    projectionColumns.fields.map((field) => field.name).sort(),
    ["chain_id", "last_scanned_block", "updated_at"].sort(),
    "progress must omit contract addresses and other source data",
  );
  assert.ok(progress.result.length <= 50, "progress result must be bounded");
  const accessAudit = await runOperatorCommand(["todo", "access-audit", "50"], env);
  verifyRedactedAccessAudit(accessAudit.result, loginName, breakGlassOperatorId);
  return ["chain-progress", "access-audit"];
}

function verifyRedactedAccessAudit(audit, loginName, breakGlassOperatorId) {
  const rehearsal = audit.find((row) => row.incident_id.startsWith("OP8-REHEARSAL-"));
  assert.ok(rehearsal, "scoped access audit must expose the synthetic rehearsal");
  assert.equal(rehearsal.operator_id, breakGlassOperatorId);
  assert.equal(rehearsal.approver_id, "approver-test");
  assert.deepEqual(
    Object.keys(rehearsal).sort(),
    ["approver_id", "expires_at", "incident_id", "operator_id", "outcome", "phase", "recorded_at", "target_database"].sort(),
    "access audit must omit audit identifiers and statement digests",
  );
  assert.ok(loginName.startsWith("op8_test_"), "audit rehearsal must use an actual scoped login role");
}

async function verifyBreakGlassExercise(client, service, databaseName) {
  const openFunction = `begin_${service}_break_glass`;
  const closeFunction = `close_${service}_break_glass`;
  const operatorRole = `${service}_break_glass_operator`;
  const eventId = randomUUID();
  const closeId = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const statementDigest = "a".repeat(64);
  const incidentId = `OP8-REHEARSAL-${service.toUpperCase()}`;
  const identity = await client.query("SELECT session_user::text AS operator_id");
  const operatorId = identity.rows[0].operator_id;

  await client.query(`SET ROLE ${operatorRole}`);
  try {
    await assert.rejects(
      client.query(
        `SELECT public.${openFunction}($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), incidentId, operatorId, operatorId, statementDigest, expiresAt],
      ),
      /distinct approver/i,
      "break-glass request must reject a self-approved request",
    );
    await assert.rejects(
      client.query(
        `SELECT public.${openFunction}($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), incidentId, "spoofed-operator", "approver-test", statementDigest, expiresAt],
      ),
      /authenticated login identity/i,
      "break-glass request must reject a caller-supplied operator identity",
    );
    await assert.rejects(
      client.query(
        `SELECT public.${openFunction}($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), incidentId, operatorId, "approver-test", statementDigest, new Date(Date.now() + 61 * 60 * 1000)],
      ),
      /expiry must be within the next hour/i,
      "break-glass request must reject an approval longer than one hour",
    );
    await assert.rejects(
      client.query(
        `SELECT public.${openFunction}($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), incidentId, operatorId, "approver-test", "not-a-digest", expiresAt],
      ),
      /SHA-256 statement digest/i,
      "break-glass request must reject an invalid statement digest",
    );

    const opened = await client.query(
      `SELECT public.${openFunction}($1, $2, $3, $4, $5, $6) AS audit_id`,
      [eventId, incidentId, operatorId, "approver-test", statementDigest, expiresAt],
    );
    assert.equal(opened.rows[0].audit_id, eventId);
    await assert.rejects(
      client.query(
        `SELECT public.${closeFunction}($1, $2, $3, $4)`,
        [eventId, randomUUID(), "different-operator", "completed"],
      ),
      /matching open break-glass/i,
      "break-glass record must be closed by its operator",
    );
    await client.query(
      `SELECT public.${closeFunction}($1, $2, $3, $4)`,
      [eventId, closeId, operatorId, "completed"],
    );
  } finally {
    await client.query("RESET ROLE");
  }

  const audit = await client.query(
    `SELECT phase, incident_id, operator_id, approver_id, target_database,
            statement_sha256, outcome
       FROM public.operator_access_audit
      WHERE event_id = $1
      ORDER BY phase`,
    [eventId],
  );
  assert.equal(audit.rowCount, 2, "exercise must persist both open and close audit records");
  assert.deepEqual(audit.rows.map((row) => row.phase), ["closed", "opened"]);
  for (const row of audit.rows) {
    assert.equal(row.incident_id, incidentId);
    assert.equal(row.operator_id, operatorId);
    assert.equal(row.approver_id, "approver-test");
    assert.equal(row.target_database, databaseName);
    assert.equal(row.statement_sha256, statementDigest);
  }
  assert.equal(audit.rows[0].outcome, "completed");

  await assert.rejects(
    client.query("UPDATE public.operator_access_audit SET outcome = 'aborted' WHERE event_id = $1", [eventId]),
    /append-only/i,
    "audit rows must reject updates",
  );
  await assert.rejects(
    client.query("DELETE FROM public.operator_access_audit WHERE event_id = $1", [eventId]),
    /append-only/i,
    "audit rows must reject deletes",
  );
  await assert.rejects(
    client.query("TRUNCATE public.operator_access_audit"),
    /append-only/i,
    "audit table must reject truncation",
  );
  return { eventId, operatorId };
}

export async function runRehearsal(rawUrl) {
  const target = parseScratchDatabaseUrl(rawUrl);
  const service = target.service;
  const client = new pg.Client({
    connectionString: target.connectionString,
    application_name: "op8-scratch-rehearsal",
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const database = await client.query("SELECT current_database() AS name");
    assert.equal(database.rows[0].name, target.databaseName, "connected database does not match the guarded scratch target");
    await verifyRoles(client, service);
    await verifyDataPrivileges(client, service);
    await verifyFunctionPrivileges(client, service);
    const exercise = await verifyBreakGlassExercise(client, service, target.databaseName);
    const routineOperations = await verifyLoginOperator(client, target, exercise.operatorId);
    console.log(JSON.stringify({
      rehearsal: "passed",
      service,
      scratchDatabase: target.databaseName,
      target: target.target,
      loginRoleFunctionOnly: true,
      deniedDirectTableAccess: true,
      routineOperations,
      breakGlassApprovalWindowMinutes: 60,
      auditRows: 2,
      immutableAudit: true,
      eventId: exercise.eventId,
    }, null, 2));
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRehearsal(process.env.OP8_SCRATCH_DATABASE_URL).catch((error) => {
    console.error(`OP-8 scratch rehearsal failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
