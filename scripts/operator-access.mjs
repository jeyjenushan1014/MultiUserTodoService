#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import pg from "pg";

const USAGE = [
  "Usage:",
  "  node scripts/operator-access.mjs account mail-status|mail-sink|mail-audit",
  "  node scripts/operator-access.mjs account access-audit [limit]",
  "  node scripts/operator-access.mjs todo chain-progress",
  "  node scripts/operator-access.mjs todo access-audit [limit]",
].join("\n");

function parseCommand(args) {
  const [service, action, limitArg, ...extra] = args;
  if (extra.length > 0 || !["account", "todo"].includes(service)) {
    throw new Error(USAGE);
  }

  const actions = service === "account"
    ? ["mail-status", "mail-sink", "mail-audit", "access-audit"]
    : ["chain-progress", "access-audit"];
  if (!actions.includes(action)) throw new Error(USAGE);

  const supportsLimit = action === "mail-audit" || action === "access-audit";
  if ((!supportsLimit && limitArg !== undefined) || (supportsLimit && limitArg !== undefined && !/^[1-9]\d*$/.test(limitArg))) {
    throw new Error(USAGE);
  }
  const limit = limitArg === undefined ? 20 : Number(limitArg);
  if (supportsLimit && limit > 50) throw new Error("Audit limit must be between 1 and 50");
  return { service, action, limit };
}

async function requireScopedLogin(client, service) {
  const routineRole = `${service}_routine_operator`;
  const breakGlassRole = `${service}_break_glass_operator`;
  const auditorRole = `${service}_operator_auditor`;
  const identity = await client.query(
    `SELECT session_user::text AS login,
            current_user::text AS active,
            role.rolcanlogin,
            role.rolsuper,
            role.rolcreatedb,
            role.rolcreaterole,
            role.rolbypassrls,
            pg_catalog.pg_has_role(session_user, $1::name, 'USAGE') AS routine_member,
            pg_catalog.pg_has_role(session_user, $2::name, 'MEMBER') AS break_glass_member,
            pg_catalog.pg_has_role(session_user, $3::name, 'MEMBER') AS auditor_member,
            pg_catalog.has_database_privilege(session_user, current_database(), 'CREATE') AS database_create,
            pg_catalog.has_schema_privilege(session_user, 'public', 'CREATE') AS schema_create
       FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = session_user`,
    [routineRole, breakGlassRole, auditorRole],
  );
  const login = identity.rows[0];
  if (
    !login
    || login.login !== login.active
    || !login.rolcanlogin
    || login.rolsuper
    || login.rolcreatedb
    || login.rolcreaterole
    || login.rolbypassrls
    || !login.routine_member
    || login.break_glass_member
    || login.auditor_member
    || login.database_create
    || login.schema_create
  ) {
    throw new Error("Database login is not a dedicated routine operator identity");
  }

  const tableAccess = await client.query(
    `SELECT c.relname
       FROM pg_catalog.pg_class AS c
       JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND (
          pg_catalog.has_table_privilege(session_user, c.oid, 'SELECT')
          OR pg_catalog.has_table_privilege(session_user, c.oid, 'INSERT')
          OR pg_catalog.has_table_privilege(session_user, c.oid, 'UPDATE')
          OR pg_catalog.has_table_privilege(session_user, c.oid, 'DELETE')
          OR pg_catalog.has_table_privilege(session_user, c.oid, 'TRUNCATE')
          OR pg_catalog.has_table_privilege(session_user, c.oid, 'REFERENCES')
          OR pg_catalog.has_table_privilege(session_user, c.oid, 'TRIGGER')
        )
      LIMIT 1`,
  );
  const sequenceAccess = await client.query(
    `SELECT c.relname
       FROM pg_catalog.pg_class AS c
       JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'S'
        AND (
          pg_catalog.has_sequence_privilege(session_user, c.oid, 'USAGE')
          OR pg_catalog.has_sequence_privilege(session_user, c.oid, 'SELECT')
          OR pg_catalog.has_sequence_privilege(session_user, c.oid, 'UPDATE')
        )
      LIMIT 1`,
  );
  if (tableAccess.rowCount > 0 || sequenceAccess.rowCount > 0) {
    throw new Error("Routine operator login has direct public-schema table or sequence privileges");
  }
  return login.login;
}

export async function runOperatorCommand(args, env = process.env) {
  const { service, action, limit } = parseCommand(args);
  const variable = service === "account"
    ? "ACCOUNT_OPERATOR_DATABASE_URL"
    : "TODO_OPERATOR_DATABASE_URL";
  const connectionString = env[variable];
  if (!connectionString) {
    throw new Error(`${variable} must be provisioned for the scoped operator login`);
  }

  const functionByAction = {
    "mail-status": "operator_mail_mode_status",
    "mail-sink": "operator_mail_mode_set_sink",
    "mail-audit": "operator_mail_mode_audit",
    "chain-progress": "operator_chain_projection_progress",
    "access-audit": "operator_access_audit_recent",
  };
  const functionName = functionByAction[action];
  const client = new pg.Client({
    connectionString,
    application_name: `routine-operator-${service}`,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const operatorId = await requireScopedLogin(client, service);
    let result;
    if (action === "mail-status" || action === "chain-progress") {
      result = await client.query(`SELECT * FROM public.${functionName}()`);
    } else if (action === "mail-sink") {
      result = await client.query(`SELECT * FROM public.${functionName}()`);
    } else {
      result = await client.query(`SELECT * FROM public.${functionName}($1)`, [limit]);
    }

    const payload = {
      service,
      action,
      operatorId,
      result: result.rows,
    };
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOperatorCommand(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : "Operator command failed");
    process.exitCode = 1;
  });
}
