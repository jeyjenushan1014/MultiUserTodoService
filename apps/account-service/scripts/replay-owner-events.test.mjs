import { describe, expect, it, vi } from "vitest";

import {
  parseOwnerReplayArguments,
  replayOwnerEvents,
  runOwnerReplayRehearsal,
} from "./replay-owner-events.mjs";
import {
  accountEmailChangedEventSchema,
  accountRegisteredEventSchema,
} from "../../todo-service/src/messaging/account-event.schema.ts";

const eventId = "5403d006-532f-4d5f-8200-9893fe84e00d";
const userId = "3bf53c86-0932-43d0-85ed-bd536c694677";
const requestId = "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0";
const occurredAt = new Date("2026-10-03T00:00:00.000Z");

function makeRow(overrides = {}) {
  return {
    id: eventId,
    event_type: "account.registered",
    event_version: 2,
    payload: { userId, email: "private@example.invalid", registrationMethod: "password" },
    request_id: requestId,
    occurred_at: occurredAt,
    published_at: occurredAt,
    ...overrides,
  };
}

function makeDependencies({ rows = [makeRow()], receipts = [], tombstones = [] } = {}) {
  const audit = [];
  const accountDb = {
    query: vi.fn(async (sql, params) => {
      if (sql.includes("INSERT INTO owner_event_replay_audit")) {
        audit.push({ status: params[4], errorCode: params[5] });
      } else if (sql.includes("UPDATE owner_event_replay_audit")) {
        audit.push({ status: params[1], errorCode: params[2] });
        return { rows: [], rowCount: 1 };
      } else if (sql.includes("FROM owner_event_replay_audit")) {
        return {
          rows: audit
            .filter((entry) => ["queued", "already_processed"].includes(entry.status))
            .map((entry) => ({ status: entry.status })),
        };
      }
      return { rows };
    }),
  };
  const todoDb = {
    query: vi.fn(async (sql, params) => {
      if (sql.includes("FROM processed_events")) {
        const selectedIds = Array.isArray(params?.[1]) ? params[1] : [params?.[0]];
        return { rows: receipts.filter((id) => selectedIds.includes(id)).map((id) => ({ event_id: id })) };
      }
      if (sql.includes("FROM account_deletion_tombstones")) {
        return { rows: tombstones.map((hash) => ({ user_id_hash: hash })) };
      }
      return { rows: [] };
    }),
  };
  const channel = {
    checkQueue: vi.fn(async () => ({ queue: "todo.owner-projection" })),
    sendToQueue: vi.fn((_queue, _body, _properties, callback) => callback(null)),
  };
  return { accountDb, todoDb, channel, audit };
}

describe("owner event replay", () => {
  it("defaults to dry-run and strictly validates bounded UTC half-open ranges", () => {
    const now = Date.parse("2026-10-03T12:00:00.000Z");
    const parsed = parseOwnerReplayArguments([
      "--from", "2026-10-03T10:00:00.000Z",
      "--to", "2026-10-03T11:00:00.000Z",
    ], now);
    expect(parsed.apply).toBe(false);
    expect(parsed.selection.kind).toBe("range");
    expect(() => parseOwnerReplayArguments([
      "--from", "2026-10-03",
      "--to", "2026-10-03T11:00:00.000Z",
    ], now)).toThrow(/canonical UTC ISO time/);
    expect(() => parseOwnerReplayArguments([
      "--from", "2026-10-03T10:00:00.000Z",
      "--to", "2026-10-03T13:00:00.000Z",
    ], now)).toThrow(/entirely in the past/);
  });

  it("prints only aggregate counts in dry-run output", async () => {
    const deps = makeDependencies();
    const summary = await replayOwnerEvents({
      ...deps,
      selection: { kind: "event-id", eventId },
    });
    expect(summary).toMatchObject({ mode: "dry-run", selected: 1, eligible: 1, queued: 0 });
    const output = JSON.stringify(summary);
    expect(output).not.toContain(eventId);
    expect(output).not.toContain(userId);
    expect(output).not.toContain("private@example.invalid");
  });

  it("validates the Account envelope, publishes directly to the queue, and clears retry count", async () => {
    const deps = makeDependencies();
    const result = await replayOwnerEvents({
      ...deps,
      selection: { kind: "event-id", eventId },
      apply: true,
      operatorId: "isolated-operator",
    });
    expect(result).toMatchObject({ selected: 1, queued: 1, failed: 0 });
    expect(deps.channel.sendToQueue).toHaveBeenCalledOnce();
    const [queue, bytes, options] = deps.channel.sendToQueue.mock.calls[0];
    expect(queue).toBe("todo.owner-projection");
    const publishedEvent = JSON.parse(bytes.toString("utf8"));
    expect(publishedEvent).toMatchObject({
      eventId,
      eventType: "account.registered",
      eventVersion: 2,
    });
    expect(accountRegisteredEventSchema.parse(publishedEvent)).toEqual(publishedEvent);
    expect(options.headers["x-todo-owner-retry-count"]).toBe(0);
    expect(options.headers.producer).toBe("account-service");
    const auditUpdate = deps.accountDb.query.mock.calls.find(([sql]) =>
      sql.includes("UPDATE owner_event_replay_audit"),
    );
    expect(auditUpdate[0]).toContain("SET status = $2, error_code = $3");
    const startedAudit = deps.accountDb.query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO owner_event_replay_audit") &&
      sql.includes("CASE WHEN $5 = 'started'"),
    );
    expect(auditUpdate[1]).toEqual([startedAudit[1][0], "queued", null]);
    expect(result.target).toBe("todo-owner-projection");
  });

  it("accepts email-change envelopes defined by the owner consumer schema", async () => {
    const deps = makeDependencies({
      rows: [makeRow({
        event_type: "account.email-changed",
        event_version: 1,
        payload: { userId, email: "private@example.invalid" },
      })],
    });
    const result = await replayOwnerEvents({
      ...deps,
      selection: { kind: "event-id", eventId },
      apply: true,
      operatorId: "isolated-operator",
    });
    const bytes = deps.channel.sendToQueue.mock.calls[0][1];
    const publishedEvent = JSON.parse(bytes.toString("utf8"));
    expect(result.queued).toBe(1);
    expect(accountEmailChangedEventSchema.parse(publishedEvent)).toEqual(publishedEvent);
  });

  it("does not publish duplicate receipts or tombstoned owners", async () => {
    const receiptDeps = makeDependencies({ receipts: [eventId] });
    const duplicate = await replayOwnerEvents({
      ...receiptDeps,
      selection: { kind: "event-id", eventId },
      apply: true,
      operatorId: "isolated-operator",
    });
    expect(duplicate.alreadyProcessed).toBe(1);
    expect(receiptDeps.channel.sendToQueue).not.toHaveBeenCalled();

    const { createHash } = await import("node:crypto");
    const userHash = createHash("sha256").update(userId).digest("hex");
    const tombstoneDeps = makeDependencies({ tombstones: [userHash] });
    const tombstoned = await replayOwnerEvents({
      ...tombstoneDeps,
      selection: { kind: "event-id", eventId },
      apply: true,
      operatorId: "isolated-operator",
    });
    expect(tombstoned.tombstoned).toBe(1);
    expect(tombstoneDeps.channel.sendToQueue).not.toHaveBeenCalled();
    expect(tombstoneDeps.audit).toContainEqual({
      status: "failed",
      errorCode: "account_deleted_tombstone",
    });
  });

  it("audits uncertain delivery without printing the event payload", async () => {
    const deps = makeDependencies();
    deps.channel.sendToQueue.mockImplementation((_queue, _body, _options, callback) =>
      callback(new Error("broker confirmation unavailable")));
    await expect(replayOwnerEvents({
      ...deps,
      selection: { kind: "event-id", eventId },
      apply: true,
      operatorId: "isolated-operator",
    })).rejects.toThrow(/replay_outcome_uncertain/);
    expect(deps.audit).toContainEqual({ status: "started", errorCode: null });
    expect(deps.audit).toContainEqual({
      status: "failed",
      errorCode: "replay_outcome_uncertain",
    });
  });

  it("audits later selected events as unattempted after uncertain delivery", async () => {
    const secondEventId = "7403d006-532f-4d5f-8200-9893fe84e00d";
    const deps = makeDependencies({
      rows: [makeRow(), makeRow({ id: secondEventId })],
    });
    deps.channel.sendToQueue.mockImplementation((_queue, _body, _options, callback) =>
      callback(new Error("broker confirmation unavailable")));
    await expect(replayOwnerEvents({
      ...deps,
      selection: {
        kind: "range",
        from: new Date("2026-10-02T00:00:00.000Z"),
        to: new Date("2026-10-03T00:00:00.000Z"),
      },
      apply: true,
      operatorId: "isolated-operator",
    })).rejects.toThrow(/replay_outcome_uncertain/);
    expect(deps.channel.sendToQueue).toHaveBeenCalledOnce();
    expect(deps.audit).toContainEqual({
      status: "failed",
      errorCode: "not_attempted_after_prior_failure",
    });
  });

  it("marks malformed source envelopes failed without publishing", async () => {
    const deps = makeDependencies({ rows: [makeRow({ event_version: 99 })] });
    const result = await replayOwnerEvents({
      ...deps,
      selection: { kind: "event-id", eventId },
      apply: true,
      operatorId: "isolated-operator",
    });
    expect(result).toMatchObject({ invalid: 1, failed: 1 });
    expect(deps.channel.sendToQueue).not.toHaveBeenCalled();
    expect(deps.audit).toContainEqual({
      status: "failed",
      errorCode: "invalid_source_event",
    });
  });

  it("rejects a range containing more than 100 published events", async () => {
    const deps = makeDependencies({ rows: Array.from({ length: 101 }, () => makeRow()) });
    await expect(replayOwnerEvents({
      ...deps,
      selection: {
        kind: "range",
        from: new Date("2026-10-02T00:00:00.000Z"),
        to: new Date("2026-10-03T00:00:00.000Z"),
      },
    })).rejects.toThrow(/exceeds 100/);
  });

  it("exposes an isolated receipt-and-duplicate rehearsal for the operations verifier", async () => {
    const deps = makeDependencies();
    const receipts = [];
    deps.todoDb.query.mockImplementation(async (sql, params) => {
      if (sql.includes("FROM processed_events")) {
        const selectedIds = Array.isArray(params?.[1]) ? params[1] : [params?.[0]];
        return { rows: receipts.filter((id) => selectedIds.includes(id)).map((id) => ({ event_id: id })) };
      }
      if (sql.includes("FROM account_deletion_tombstones")) return { rows: [] };

      return { rows: [] };
    });
    deps.channel.sendToQueue.mockImplementation((_queue, _body, _properties, callback) => {
      receipts.push(eventId);
      callback(null);
    });

    const proof = await runOwnerReplayRehearsal({
      ...deps,
      eventId,
      operatorId: "isolated-operator",
    });
    expect(proof).toEqual({
      result: "passed",
      firstPass: { queued: 1 },
      secondPass: { alreadyProcessed: 1, queued: 0 },
      audit: { queued: 1, alreadyProcessed: 1 },
    });
    expect(deps.channel.sendToQueue).toHaveBeenCalledOnce();
  });
});
