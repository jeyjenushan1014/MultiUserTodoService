export const TODO_HISTORY_EVENT_TYPES = [
  "todo.created",
  "todo.completed",
  "todo.shared",
  "todo.share-withdrawn",
  "todo.deleted",
] as const;

export type TodoHistoryEventType =
  (typeof TODO_HISTORY_EVENT_TYPES)[number];

export interface TodoHistoryRecord {
  readonly id: string;
  readonly eventId: string;
  readonly todoId: string;
  readonly actorId: string;
  readonly eventType: TodoHistoryEventType;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly details: Record<string, unknown>;
}

export interface AppendTodoHistoryRequest {
  readonly eventId: string;
  readonly todoId: string;
  readonly actorId: string;
  readonly eventType: TodoHistoryEventType;
  readonly requestId: string;
  readonly occurredAt: Date;
  readonly details: Record<string, unknown>;
}