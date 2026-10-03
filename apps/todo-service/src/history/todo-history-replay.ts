import {
  TODO_HISTORY_EVENT_TYPES,
} from "./todo-history.types.js";
import { z } from "zod";

export interface TodoHistoryReplayCandidate {
  readonly id: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: unknown;
  readonly requestId: string;
  readonly occurredAt: Date;
  readonly publishedAt: Date | null;
}

export interface TodoHistoryReplayPlan {
  readonly eventId: string;
  readonly eventType: (typeof TODO_HISTORY_EVENT_TYPES)[number];
  readonly eventVersion: number;
  readonly requestId: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TodoHistoryReplayRequest {
    readonly apply: boolean;
    readonly target: string;
    readonly selection:
      | { readonly kind: "event-id"; readonly eventId: string }
      | { readonly kind: "range"; readonly from: Date; readonly to: Date };
  }

export function parseTodoHistoryReplayArguments(
    args: readonly string[],
  ): TodoHistoryReplayRequest {
    const values = new Map<string, string>();
    let apply = false;

    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      if (argument === undefined) {
        throw new Error("Replay argument list is invalid");
      }
      if (argument === "--apply") {
        if (apply) throw new Error("--apply may only be specified once");
        apply = true;
        continue;
      }

      if (!["--event-id", "--target", "--from", "--to"].includes(argument)) {
        throw new Error(`Unknown argument: ${argument}`);
      }
      if (values.has(argument)) {
        throw new Error(`${argument} may only be specified once`);
      }

      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      values.set(argument, value);
      index += 1;
    }

    const target = values.get("--target");
    const eventId = values.get("--event-id");
    const fromText = values.get("--from");
    const toText = values.get("--to");
    const hasRange = fromText !== undefined || toText !== undefined;

    if (target !== "todo-history") {
      throw new Error("Supported replay target is todo-history only");
    }

    if ((eventId !== undefined) === hasRange || (hasRange && (!fromText || !toText))) {
      throw new Error(
        "Usage: replay-event.mjs (--event-id <uuid> | --from <ISO-8601> --to <ISO-8601>) --target todo-history [--apply]",
      );
    }

    if (eventId !== undefined) {
      if (!UUID_PATTERN.test(eventId)) throw new Error("Event ID must be a UUID");
      return {
        apply,
        target,
        selection: { kind: "event-id", eventId },
      };
    }

    const timestamp = z.iso.datetime({ offset: true });
    if (!timestamp.safeParse(fromText).success || !timestamp.safeParse(toText).success) {
      throw new Error("Replay range must use ISO-8601 timestamps with an explicit timezone");
    }
    if (fromText === undefined || toText === undefined) {
      throw new Error("Replay range requires both bounds");
    }
    const fromTime = Date.parse(fromText);
    const toTime = Date.parse(toText);
    if (
      !Number.isFinite(fromTime) ||
      !Number.isFinite(toTime) ||
      fromTime >= toTime ||
      toTime > Date.now()
    ) {
      throw new Error("Replay range must be valid, in the past, and from must be earlier than to");
    }

    return {
      apply,
      target,
      selection: {
        kind: "range",
        from: new Date(fromTime),
        to: new Date(toTime),
      },
    };
  }


function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createTodoHistoryReplayPlan(
  candidate: TodoHistoryReplayCandidate,
  target: string,
): TodoHistoryReplayPlan {
  if (target !== "todo-history") {
    throw new Error("Supported replay target is todo-history only");
  }

  if (candidate.publishedAt === null) {
    throw new Error("Only already-published outbox events can be replayed");
  }

  if (!UUID_PATTERN.test(candidate.id)) {
    throw new Error("Outbox event ID is not a UUID");
  }

  if (
    !TODO_HISTORY_EVENT_TYPES.some(
      (eventType) => eventType === candidate.eventType,
    )
  ) {
    throw new Error("Event type is not accepted by todo-history");
  }

  if (!isRecord(candidate.payload)) {
    throw new Error("Outbox payload is not an event envelope");
  }

  const payload = candidate.payload;
  const eventPayload = payload.payload;
  const actorId =
    isRecord(eventPayload)
      ? candidate.eventType === "todo.completed"
        ? eventPayload.completedByUserId
        : candidate.eventType === "todo.deleted"
          ? eventPayload.deletedByUserId
          : eventPayload.ownerId
      : undefined;
  const payloadOccurredAt =
    typeof payload.occurredAt === "string"
      ? Date.parse(payload.occurredAt)
      : Number.NaN;

  if (
    payload.eventId !== candidate.id ||
    payload.eventType !== candidate.eventType ||
    payload.eventVersion !== candidate.eventVersion ||
    payload.requestId !== candidate.requestId ||
    payload.producer !== "todo-service" ||
    !Number.isFinite(payloadOccurredAt) ||
    payloadOccurredAt !== candidate.occurredAt.getTime() ||
    !Number.isFinite(candidate.occurredAt.getTime()) ||
    !Number.isInteger(candidate.eventVersion) ||
    candidate.eventVersion < 1 ||
    !isRecord(eventPayload) ||
    typeof eventPayload.todoId !== "string" ||
    !UUID_PATTERN.test(eventPayload.todoId) ||
    typeof actorId !== "string" ||
    !UUID_PATTERN.test(actorId) ||
    !UUID_PATTERN.test(candidate.requestId)
  ) {
    throw new Error("Outbox row does not match its original event envelope");
  }

  return {
    eventId: candidate.id,
    eventType: candidate.eventType as TodoHistoryReplayPlan["eventType"],
    eventVersion: candidate.eventVersion,
    requestId: candidate.requestId,
    occurredAt: candidate.occurredAt,
    payload,
  };
}