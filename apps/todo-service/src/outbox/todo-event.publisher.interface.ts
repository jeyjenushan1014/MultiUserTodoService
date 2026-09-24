import type {
  TodoOutboxEvent,
} from "./todo-outbox.types.js";

export interface TodoEventPublisher {
  publish(
    event:
      TodoOutboxEvent,
  ): Promise<void>;
}