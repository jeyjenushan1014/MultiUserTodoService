import type {
  EventEnvelope,
} from "../../events/event-envelope.contract.js";

export interface TodoCreatedPayload {
  readonly todoId:
    string;

  readonly ownerId:
    string;

  readonly title:
    string;
}

export interface TodoCompletedPayload {
  readonly todoId:
    string;

  readonly ownerId:
    string;

  readonly completedByUserId:
    string;
}

export interface TodoSharedPayload {
  readonly shareId:
    string;

  readonly todoId:
    string;

  readonly ownerId:
    string;

  readonly recipientId:
    string;
}

export interface TodoShareWithdrawnPayload {
  readonly shareId:
    string;

  readonly todoId:
    string;

  readonly ownerId:
    string;

  readonly recipientId:
    string;
}

export interface TodoDeletedPayload {
  readonly todoId:
    string;

  readonly ownerId:
    string;

  readonly deletedByUserId:
    string;
}

export type TodoCreatedEvent =
  EventEnvelope<
    "todo.created",
    TodoCreatedPayload
  >;

export type TodoCompletedEvent =
  EventEnvelope<
    "todo.completed",
    TodoCompletedPayload
  >;

export type TodoSharedEvent =
  EventEnvelope<
    "todo.shared",
    TodoSharedPayload
  >;

export type TodoShareWithdrawnEvent =
  EventEnvelope<
    "todo.share-withdrawn",
    TodoShareWithdrawnPayload
  >;

export type TodoDeletedEvent =
  EventEnvelope<
    "todo.deleted",
    TodoDeletedPayload
  >;

export type TodoIntegrationEvent =
  | TodoCreatedEvent
  | TodoCompletedEvent
  | TodoSharedEvent
  | TodoShareWithdrawnEvent
  | TodoDeletedEvent;