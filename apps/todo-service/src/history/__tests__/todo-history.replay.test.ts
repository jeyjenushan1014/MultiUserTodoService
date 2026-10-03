import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createTodoHistoryReplayPlan,
  parseTodoHistoryReplayArguments,
} from "../todo-history-replay.js";
import type { TodoHistoryReplayCandidate } from "../todo-history-replay.js";

const occurredAt = new Date("2026-10-03T12:00:00.000Z");
const eventId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";

function candidate(overrides: Partial<TodoHistoryReplayCandidate> = {}): TodoHistoryReplayCandidate {
  return {
    id: eventId,
    eventType: "todo.completed",
    eventVersion: 1,
    payload: {
      eventId,
      eventType: "todo.completed",
      eventVersion: 1,
      producer: "todo-service",
      requestId,
      occurredAt: occurredAt.toISOString(),
      payload: {
        todoId: "33333333-3333-4333-8333-333333333333",
        ownerId: "44444444-4444-4444-8444-444444444444",
        completedByUserId: "44444444-4444-4444-8444-444444444444",
      },
    },
    requestId,
    occurredAt,
    publishedAt: new Date("2026-10-03T12:01:00.000Z"),
    ...overrides,
  };
}

describe("createTodoHistoryReplayPlan", () => {
  it("accepts a published event and preserves its envelope", () => {
    const plan = createTodoHistoryReplayPlan(
      candidate(),
      "todo-history",
    );

    expect(plan.eventId).toBe(eventId);
    expect(plan.eventType).toBe("todo.completed");
    expect(plan.payload.eventId).toBe(eventId);
  });

  it("rejects any target other than the explicit history consumer", () => {
    expect(() =>
      createTodoHistoryReplayPlan(candidate(), "account-notifications"),
    ).toThrow("Supported replay target is todo-history only");
  });

  it("rejects events that have not completed outbox publication", () => {
    expect(() =>
      createTodoHistoryReplayPlan(
        candidate({ publishedAt: null }),
        "todo-history",
      ),
    ).toThrow("Only already-published outbox events can be replayed");
  });

  it("rejects event types not consumed by history", () => {
    expect(() =>
      createTodoHistoryReplayPlan(
        candidate({ eventType: "account.registered" }),
        "todo-history",
      ),
    ).toThrow("Event type is not accepted by todo-history");
  });

  it("rejects a row whose envelope identity or metadata does not match", () => {
    const invalidCandidate = candidate({
      payload: {
        ...candidate().payload as Record<string, unknown>,
        producer: "account-service",
      },
    });

    expect(() =>
      createTodoHistoryReplayPlan(invalidCandidate, "todo-history"),
    ).toThrow("Outbox row does not match its original event envelope");
  });
});

describe("parseTodoHistoryReplayArguments", () => {
  it("accepts an ordered UTC range for the named history consumer", () => {
    const request = parseTodoHistoryReplayArguments([
      "--from", "2026-10-01T00:00:00Z",
      "--to", "2026-10-02T00:00:00Z",
      "--target", "todo-history",
    ]);

    expect(request.selection.kind).toBe("range");
    if (request.selection.kind === "range") {
      expect(request.selection.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(request.selection.to.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    }
    expect(request.apply).toBe(false);
  });

  it("accepts one explicit event ID and apply flag", () => {
    const request = parseTodoHistoryReplayArguments([
      "--event-id", eventId,
      "--target", "todo-history",
      "--apply",
    ]);

    expect(request.selection).toEqual({ kind: "event-id", eventId });
    expect(request.apply).toBe(true);
  });

  it("rejects missing range bounds and conflicting selectors", () => {
    expect(() => parseTodoHistoryReplayArguments([
      "--from", "2026-10-01T00:00:00Z",
      "--target", "todo-history",
    ])).toThrow("Usage:");
    expect(() => parseTodoHistoryReplayArguments([
      "--event-id", eventId,
      "--from", "2026-10-01T00:00:00Z",
      "--to", "2026-10-02T00:00:00Z",
      "--target", "todo-history",
    ])).toThrow("Usage:");
  });

  it("rejects invalid or reversed date ranges and malformed IDs", () => {
    expect(() => parseTodoHistoryReplayArguments([
      "--from", "2026-10-02T00:00:00Z",
      "--to", "2026-10-01T00:00:00Z",
      "--target", "todo-history",
    ])).toThrow("Replay range must be valid");
    expect(() => parseTodoHistoryReplayArguments([
      "--event-id", "not-a-uuid",
      "--target", "todo-history",
    ])).toThrow("Event ID must be a UUID");
    expect(() => parseTodoHistoryReplayArguments([
      "--from", "2026-10-03T00:00:00Z",
      "--to", "2999-10-03T00:00:00Z",
      "--target", "todo-history",
    ])).toThrow("Replay range must be valid");
  });

  it("rejects repeated options and unsupported targets", () => {
    expect(() => parseTodoHistoryReplayArguments([
      "--target", "todo-history",
      "--target", "todo-history",
      "--event-id", eventId,
    ])).toThrow("--target may only be specified once");
    expect(() => parseTodoHistoryReplayArguments([
      "--target", "account-notifications",
      "--event-id", eventId,
    ])).toThrow("Supported replay target is todo-history only");
  });

  it("requires explicit ISO timestamps rather than locale-dependent dates", () => {
    for (const from of ["10/01/2026", "2026-10-01", "2026-10-01T00:00:00", "2026-02-30T00:00:00Z"]) {
      expect(() => parseTodoHistoryReplayArguments([
        "--from", from,
        "--to", "2026-10-02T00:00:00Z",
        "--target", "todo-history",
      ])).toThrow("ISO-8601");
    }
  });
});