import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import amqp from "amqplib";
import pg from "pg";
import { z } from "zod";

const OWNER_CONSUMER = "todo-owner-projection";
const OWNER_QUEUE = process.env.TODO_OWNER_QUEUE ?? "todo.owner-projection";
const EVENT_TYPES = ["account.registered", "account.email-changed"];
const MAX_RANGE_EVENTS = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRICT_UTC_ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const registeredSchema = z.discriminatedUnion("eventVersion", [
  z.object({
    eventId: z.uuid(),
    eventType: z.literal("account.registered"),
    eventVersion: z.literal(1),
    producer: z.literal("account-service"),
    requestId: z.uuid(),
    occurredAt: z.iso.datetime(),
    payload: z.object({ userId: z.uuid(), email: z.email() }),
  }),
  z.object({
    eventId: z.uuid(),
    eventType: z.literal("account.registered"),
    eventVersion: z.literal(2),
    producer: z.literal("account-service"),
    requestId: z.uuid(),
    occurredAt: z.iso.datetime(),
    payload: z.object({
      userId: z.uuid(),
      email: z.email(),
      registrationMethod: z.literal("password"),
    }),
  }),
]);

const emailChangedSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("account.email-changed"),
  eventVersion: z.literal(1),
  producer: z.literal("account-service"),
  requestId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.object({ userId: z.uuid(), email: z.email() }),
});

function parseStrictIsoTime(value, flag) {
  if (!STRICT_UTC_ISO_PATTERN.test(value)) {
    throw new Error(`${flag} must be a canonical UTC ISO time (YYYY-MM-DDTHH:mm:ss.sssZ)`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    throw new Error(`${flag} must be a valid UTC ISO time`);
  }
  return new Date(time);
}

export function parseOwnerReplayArguments(args, now = Date.now()) {
  const values = new Map();
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      if (apply) throw new Error("--apply may only be specified once");
      apply = true;
      continue;
    }
    if (!["--event-id", "--from", "--to"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (values.has(argument)) throw new Error(`${argument} may only be specified once`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }

  const eventId = values.get("--event-id");
  const fromText = values.get("--from");
  const toText = values.get("--to");
  const hasRange = fromText !== undefined || toText !== undefined;
  if ((eventId !== undefined) === hasRange || (hasRange && (!fromText || !toText))) {
    throw new Error(
      "Usage: replay-owner-events.mjs (--event-id <uuid> | --from <UTC-ISO> --to <UTC-ISO>) [--apply]",
    );
  }
  if (eventId !== undefined) {
    if (!UUID_PATTERN.test(eventId)) throw new Error("--event-id must be a UUID");
    return { apply, selection: { kind: "event-id", eventId } };
  }

  const from = parseStrictIsoTime(fromText, "--from");
  const to = parseStrictIsoTime(toText, "--to");
  if (from >= to || to.getTime() > now) {
    throw new Error("Replay range must be half-open, ordered, and entirely in the past");
  }
  return { apply, selection: { kind: "range", from, to } };
}

function createReplayPlan(row) {
  if (
    typeof row.id !== "string" ||
    !UUID_PATTERN.test(row.id) ||
    !EVENT_TYPES.includes(row.event_type) ||
    !Number.isInteger(row.event_version) ||
    typeof row.request_id !== "string" ||
    !UUID_PATTERN.test(row.request_id) ||
    !(row.occurred_at instanceof Date) ||
    !Number.isFinite(row.occurred_at.getTime()) ||
    row.published_at === null
  ) {
    throw new Error("Invalid source outbox metadata");
  }

  const envelope = {
    eventId: row.id,
    eventType: row.event_type,
    eventVersion: row.event_version,
    producer: "account-service",
    requestId: row.request_id,
    occurredAt: row.occurred_at.toISOString(),
    payload: row.payload,
  };
  const schema = row.event_type === "account.registered"
    ? registeredSchema
    : emailChangedSchema;
  const event = schema.parse(envelope);
  if (
    event.eventId !== row.id ||
    event.eventType !== row.event_type ||
    event.eventVersion !== row.event_version ||
    event.requestId !== row.request_id ||
    Date.parse(event.occurredAt) !== row.occurred_at.getTime()
  ) {
    throw new Error("Source outbox metadata does not match its event envelope");
  }
  return event;
}

async function selectOutboxRows(accountDb, selection) {
  if (selection.kind === "event-id") {
    const result = await accountDb.query(
      `
        SELECT id, event_type, event_version, payload, request_id,
               occurred_at, published_at
        FROM outbox_events
        WHERE id = $1
          AND aggregate_type = 'account'
          AND event_type = ANY($2::text[])
          AND published_at IS NOT NULL
      `,
      [selection.eventId, EVENT_TYPES],
    );
    if (result.rows.length !== 1) {
      throw new Error("No published supported Account event matched the selection");
    }
    return result.rows;
  }

  const result = await accountDb.query(
    `
      SELECT id, event_type, event_version, payload, request_id,
             occurred_at, published_at
      FROM outbox_events
      WHERE occurred_at >= $1
        AND occurred_at < $2
        AND aggregate_type = 'account'
        AND event_type = ANY($3::text[])
        AND published_at IS NOT NULL
      ORDER BY occurred_at ASC, id ASC
      LIMIT $4
    `,
    [selection.from, selection.to, EVENT_TYPES, MAX_RANGE_EVENTS + 1],
  );
  if (result.rows.length > MAX_RANGE_EVENTS) {
    throw new Error("Replay range exceeds 100 events; use a narrower range");
  }
  return result.rows;
}

async function getConsumerReceipts(todoDb, eventIds) {
  if (eventIds.length === 0) return new Set();
  const result = await todoDb.query(
    `
      SELECT event_id
      FROM processed_events
      WHERE consumer_name = $1
        AND event_id = ANY($2::uuid[])
    `,
    [OWNER_CONSUMER, eventIds],
  );
  return new Set(result.rows.map((row) => row.event_id));
}

async function getTombstonedUsers(todoDb, plans) {
  if (plans.length === 0) return new Set();
  const hashes = [...new Set(plans.map((plan) =>
    createHash("sha256").update(plan.payload.userId).digest("hex"),
  ))];
  const result = await todoDb.query(
    `
      SELECT user_id_hash
      FROM account_deletion_tombstones
      WHERE user_id_hash = ANY($1::char(64)[])
    `,
    [hashes],
  );
  return new Set(result.rows.map((row) => row.user_id_hash));
}

async function insertAudit(accountDb, eventId, operatorId, status, errorCode = null) {
  const auditId = randomUUID();
  await accountDb.query(
    `
      INSERT INTO owner_event_replay_audit (
        id, event_id, target_consumer, operator_id, status, error_code, completed_at
      )
      VALUES ($1, $2, $3, $4, $5::varchar, $6,
              CASE WHEN $5::varchar = 'started' THEN NULL ELSE CURRENT_TIMESTAMP END)
    `,
    [auditId, eventId, OWNER_CONSUMER, operatorId, status, errorCode],
  );
  return auditId;
}

async function updateAudit(accountDb, auditId, status, errorCode = null) {
  const result = await accountDb.query(
    `
      UPDATE owner_event_replay_audit
      SET status = $2, error_code = $3, completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND status = 'started'
    `,
    [auditId, status, errorCode],
  );
  if (result.rowCount !== 1) {
    throw new Error("Replay audit state could not be updated");
  }
}

function blankSummary(mode) {
  return {
    mode,
    target: OWNER_CONSUMER,
    selected: 0,
    queued: 0,
    eligible: 0,
    alreadyProcessed: 0,
    tombstoned: 0,
    invalid: 0,
    failed: 0,
  };
}

function makePublishOptions(event) {
  return {
    persistent: true,
    contentType: "application/json",
    contentEncoding: "utf-8",
    messageId: event.eventId,
    correlationId: event.requestId,
    type: event.eventType,
    timestamp: Math.floor(Date.parse(event.occurredAt) / 1_000),
    headers: {
      eventVersion: event.eventVersion,
      producer: event.producer,
      operatorReplay: true,
      "x-todo-owner-retry-count": 0,
    },
  };
}

function confirmSend(channel, event) {
  return new Promise((resolve, reject) => {
    try {
      channel.sendToQueue(
        OWNER_QUEUE,
        Buffer.from(JSON.stringify(event), "utf8"),
        makePublishOptions(event),
        (error) => error ? reject(error) : resolve(),
      );
    } catch (error) {
      reject(error);
    }
  });
}

export async function replayOwnerEvents({
  accountDb,
  todoDb,
  channel,
  selection,
  apply = false,
  operatorId,
}) {
  if (apply && (!operatorId || operatorId.trim().length === 0 || operatorId.length > 100)) {
    throw new Error("An operator ID (1-100 characters) is required for --apply");
  }
  const rows = await selectOutboxRows(accountDb, selection);
  const prepared = rows.map((row) => {
    try {
      return { eventId: row.id, event: createReplayPlan(row) };
    } catch {
      return { eventId: row.id, errorCode: "invalid_source_event" };
    }
  });
  const validPlans = prepared.flatMap((item) =>
    item.event === undefined ? [] : [item.event],
  );
  const receipts = await getConsumerReceipts(
    todoDb,
    validPlans.map((event) => event.eventId),
  );
  const tombstoneHashes = await getTombstonedUsers(todoDb, validPlans);
  const tombstonedEvents = new Set(validPlans
    .filter((event) => tombstoneHashes.has(
      createHash("sha256").update(event.payload.userId).digest("hex"),
    ))
    .map((event) => event.eventId));

  const summary = blankSummary(apply ? "apply" : "dry-run");
  summary.selected = prepared.length;
  for (const item of prepared) {
    if (item.errorCode) {
      summary.invalid += 1;
    } else if (receipts.has(item.eventId)) {
      summary.alreadyProcessed += 1;
    } else if (tombstonedEvents.has(item.eventId)) {
      summary.tombstoned += 1;
    } else if (!apply) {
      summary.eligible += 1;
    } else {
      summary.queued += 1;
    }
  }
  if (!apply) return summary;

  const result = blankSummary("apply");
  result.selected = prepared.length;
  let stopCode;
  for (const item of prepared) {
    if (item.errorCode) {
      await insertAudit(accountDb, item.eventId, operatorId, "failed", item.errorCode);
      result.invalid += 1;
      result.failed += 1;
      continue;
    }
    if (receipts.has(item.eventId)) {
      await insertAudit(accountDb, item.eventId, operatorId, "already_processed");
      result.alreadyProcessed += 1;
      continue;
    }
    if (tombstonedEvents.has(item.eventId)) {
      await insertAudit(
        accountDb,
        item.eventId,
        operatorId,
        "failed",
        "account_deleted_tombstone",
      );
      result.tombstoned += 1;
      result.failed += 1;
      continue;
    }
    if (stopCode !== undefined) {
      await insertAudit(
        accountDb,
        item.eventId,
        operatorId,
        "failed",
        "not_attempted_after_prior_failure",
      );
      result.failed += 1;
      continue;
    }

    const auditId = await insertAudit(accountDb, item.eventId, operatorId, "started");
    let deliveryAttempted = false;
    let deliveryConfirmed = false;
    try {
      await channel.checkQueue(OWNER_QUEUE);
      deliveryAttempted = true;
      await confirmSend(channel, item.event);
      deliveryConfirmed = true;
      await updateAudit(accountDb, auditId, "queued");
      result.queued += 1;
    } catch {
      const errorCode = deliveryConfirmed
        ? "delivery_confirmed_audit_update_failed"
        : deliveryAttempted
          ? "replay_outcome_uncertain"
          : "replay_failed";
      await updateAudit(accountDb, auditId, "failed", errorCode);
      result.failed += 1;
      stopCode = errorCode;
    }
  }
  if (stopCode !== undefined) {
    throw new Error(
      `Owner replay stopped after a delivery error (${stopCode}); reconcile before retrying the remaining selection`,
    );
  }
  return result;
}

async function waitForOwnerReceipt(todoDb, eventId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const result = await todoDb.query(
      `
        SELECT event_id
        FROM processed_events
        WHERE event_id = $1
          AND consumer_name = $2
      `,
      [eventId, OWNER_CONSUMER],
    );
    if (result.rows.length === 1) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Owner consumer did not record the replay receipt before timeout");
}

export async function runOwnerReplayRehearsal({
  accountDb,
  todoDb,
  channel,
  eventId,
  operatorId,
  timeoutMs = 10_000,
}) {
  if (!UUID_PATTERN.test(eventId)) throw new Error("Rehearsal event ID must be a UUID");
  const selection = { kind: "event-id", eventId };
  const initialReceipt = await getConsumerReceipts(todoDb, [eventId]);
  if (initialReceipt.has(eventId)) {
    throw new Error("Rehearsal requires a published event not yet processed by the owner consumer");
  }
  const first = await replayOwnerEvents({
    accountDb, todoDb, channel, selection, apply: true, operatorId,
  });
  if (first.queued !== 1 || first.failed !== 0) {
    throw new Error("Rehearsal event was not queued exactly once");
  }
  await waitForOwnerReceipt(todoDb, eventId, timeoutMs);
  const second = await replayOwnerEvents({
    accountDb, todoDb, channel, selection, apply: true, operatorId,
  });
  if (second.alreadyProcessed !== 1 || second.queued !== 0) {
    throw new Error("Owner processed_events did not prevent a duplicate replay");
  }
  const audit = await accountDb.query(
    `
      SELECT status
      FROM owner_event_replay_audit
      WHERE event_id = $1
        AND target_consumer = $2
        AND operator_id = $3
        AND status = ANY($4::text[])
    `,
    [eventId, OWNER_CONSUMER, operatorId, ["queued", "already_processed"]],
  );
  const auditedStatuses = new Set(audit.rows.map((row) => row.status));
  if (!auditedStatuses.has("queued") || !auditedStatuses.has("already_processed")) {
    throw new Error("Replay audit does not contain both queued and already-processed proof");
  }
  return {
    result: "passed",
    firstPass: { queued: first.queued },
    secondPass: { alreadyProcessed: second.alreadyProcessed, queued: second.queued },
    audit: { queued: 1, alreadyProcessed: 1 },
  };
}

async function main() {
  const options = parseOwnerReplayArguments(process.argv.slice(2));
  const accountUrl = process.env.ACCOUNT_DATABASE_URL;
  const todoUrl = process.env.TODO_DATABASE_URL;
  const rabbitUrl = process.env.RABBITMQ_URL;
  const operatorId = process.env.TODO_EVENT_REPLAY_OPERATOR_ID?.trim();
  if (!accountUrl || !todoUrl) {
    throw new Error("ACCOUNT_DATABASE_URL and TODO_DATABASE_URL must be configured");
  }
  if (options.apply && !rabbitUrl) {
    throw new Error("RABBITMQ_URL must be configured for --apply");
  }
  if (options.apply && (!operatorId || operatorId.length > 100)) {
    throw new Error("TODO_EVENT_REPLAY_OPERATOR_ID must identify the operator (1-100 characters)");
  }

  const accountDb = new pg.Pool({ connectionString: accountUrl });
  const todoDb = new pg.Pool({ connectionString: todoUrl });
  let connection;
  let channel;
  try {
    if (options.apply) {
      connection = await amqp.connect(rabbitUrl);
      channel = await connection.createConfirmChannel();
    }
    const summary = await replayOwnerEvents({
      accountDb,
      todoDb,
      channel,
      selection: options.selection,
      apply: options.apply,
      operatorId,
    });
    console.log(JSON.stringify(summary));
    if (summary.invalid > 0) {
      throw new Error("One or more selected source events failed envelope validation");
    }
  } finally {
    await channel?.close();
    await connection?.close();
    await Promise.all([accountDb.end(), todoDb.end()]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Owner event replay failed");
    process.exitCode = 1;
  });
}
