import {
  randomUUID,
} from "node:crypto";

import type {
  EventEnvelope,
  TodoCompletedEvent,
  TodoCompletedPayload,
  TodoCreatedEvent,
  TodoCreatedPayload,
  TodoDeletedEvent,
  TodoDeletedPayload,
  TodoSharedEvent,
  TodoSharedPayload,
  TodoShareWithdrawnEvent,
  TodoShareWithdrawnPayload,
} from "@todo/contracts";

function createEvent<
  EventType extends string,
  Payload,
>(
  eventType: EventType,
  payload: Payload,
  requestId: string,
): EventEnvelope<
  EventType,
  Payload
> {
  return {
    eventId:
      randomUUID(),

    eventType,

    eventVersion:
      1,

    producer:
      "todo-service",

    requestId,

    occurredAt:
      new Date()
        .toISOString(),

    payload,
  };
}

export function createTodoCreatedEvent(
  payload:
    TodoCreatedPayload,
  requestId: string,
): TodoCreatedEvent {
  return createEvent(
    "todo.created",
    payload,
    requestId,
  );
}

export function createTodoCompletedEvent(
  payload:
    TodoCompletedPayload,
  requestId: string,
): TodoCompletedEvent {
  return createEvent(
    "todo.completed",
    payload,
    requestId,
  );
}

export function createTodoSharedEvent(
  payload:
    TodoSharedPayload,
  requestId: string,
): TodoSharedEvent {
  return createEvent(
    "todo.shared",
    payload,
    requestId,
  );
}

export function createTodoShareWithdrawnEvent(
  payload:
    TodoShareWithdrawnPayload,
  requestId: string,
): TodoShareWithdrawnEvent {
  return createEvent(
    "todo.share-withdrawn",
    payload,
    requestId,
  );
}

export function createTodoDeletedEvent(
  payload:
    TodoDeletedPayload,
  requestId: string,
): TodoDeletedEvent {
  return createEvent(
    "todo.deleted",
    payload,
    requestId,
  );
}