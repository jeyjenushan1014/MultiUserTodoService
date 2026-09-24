import type {
  ClaimTodoOutboxEventsOptions,
  MarkTodoOutboxFailedData,
  MarkTodoOutboxPublishedData,
  TodoOutboxEvent,
} from "./todo-outbox.types.js";

export interface TodoOutboxRepository {
  claimPendingEvents(
    options:
      ClaimTodoOutboxEventsOptions,
  ): Promise<
    readonly TodoOutboxEvent[]
  >;

  markPublished(
    data:
      MarkTodoOutboxPublishedData,
  ): Promise<void>;

  markFailed(
    data:
      MarkTodoOutboxFailedData,
  ): Promise<void>;
}