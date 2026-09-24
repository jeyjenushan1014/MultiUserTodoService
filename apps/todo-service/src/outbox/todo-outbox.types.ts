import type {
  TodoIntegrationEvent,
} from "@todo/contracts";

export type TodoOutboxEventType =
  TodoIntegrationEvent[
    "eventType"
  ];

export interface TodoOutboxEvent {
  readonly id:
    string;

  readonly aggregateId:
    string;

  readonly eventType:
    TodoOutboxEventType;

  readonly eventVersion:
    number;

  /*
   * The JSONB payload contains the complete event
   * envelope written by PostgresTodoOutboxWriter.
   */
  readonly payload:
    unknown;

  readonly requestId:
    string;

  readonly occurredAt:
    Date;

  /*
   * Claiming an event increments this value before
   * it is returned to the worker.
   */
  readonly publishAttempts:
    number;
}

export interface ClaimTodoOutboxEventsOptions {
  readonly batchSize:
    number;

  readonly workerId:
    string;

  readonly lockTimeoutMilliseconds:
    number;
}

export interface MarkTodoOutboxPublishedData {
  readonly eventId:
    string;

  readonly workerId:
    string;
}

export interface MarkTodoOutboxFailedData {
  readonly eventId:
    string;

  readonly workerId:
    string;

  readonly nextAttemptAt:
    Date;

  readonly errorMessage:
    string;
}