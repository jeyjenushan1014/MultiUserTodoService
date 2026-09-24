import type {
  TodoEventPublisher,
} from "./todo-event.publisher.interface.js";

import type {
  TodoOutboxRepository,
} from "./todo-outbox.repository.interface.js";

import {
  createTodoOutboxNextAttemptAt,
} from "./todo-outbox.retry-policy.js";

import type {
  TodoOutboxEvent,
} from "./todo-outbox.types.js";

const MAX_ERROR_MESSAGE_LENGTH =
  2_000;

export interface TodoOutboxServiceOptions {
  readonly workerId:
    string;

  readonly batchSize:
    number;

  readonly lockTimeoutMilliseconds:
    number;
}

export interface TodoOutboxBatchResult {
  readonly claimed:
    number;

  readonly published:
    number;

  readonly failed:
    number;
}

export type TodoOutboxClock =
  () => Date;

function getErrorMessage(
  error: unknown,
): string {
  const message =
    error instanceof Error &&
    error.message.length > 0
      ? error.message
      : "Unknown TODO event publication failure";

  return message.slice(
    0,
    MAX_ERROR_MESSAGE_LENGTH,
  );
}

export class TodoOutboxService {
  public constructor(
    private readonly repository:
      TodoOutboxRepository,

    private readonly publisher:
      TodoEventPublisher,

    private readonly options:
      TodoOutboxServiceOptions,

    private readonly clock:
      TodoOutboxClock =
        () => new Date(),
  ) {}

  public async processBatch():
    Promise<TodoOutboxBatchResult> {
    const events =
      await this.repository
        .claimPendingEvents({
          batchSize:
            this.options.batchSize,

          workerId:
            this.options.workerId,

          lockTimeoutMilliseconds:
            this.options
              .lockTimeoutMilliseconds,
        });

    let published =
      0;

    let failed =
      0;

    for (const event of events) {
      const publicationSucceeded =
        await this.processEvent(
          event,
        );

      if (publicationSucceeded) {
        published += 1;
      } else {
        failed += 1;
      }
    }

    return {
      claimed:
        events.length,

      published,
      failed,
    };
  }

  private async processEvent(
    event:
      TodoOutboxEvent,
  ): Promise<boolean> {
    try {
      await this.publisher
        .publish(
          event,
        );

      await this.repository
        .markPublished({
          eventId:
            event.id,

          workerId:
            this.options.workerId,
        });

      return true;
    } catch (error) {
      /*
       * If RabbitMQ accepts the message but the
       * database update fails, the event may be
       * published again. Consumers must therefore
       * be idempotent.
       */
      await this.repository
        .markFailed({
          eventId:
            event.id,

          workerId:
            this.options.workerId,

          nextAttemptAt:
            createTodoOutboxNextAttemptAt(
              event.publishAttempts,
              this.clock(),
            ),

          errorMessage:
            getErrorMessage(
              error,
            ),
        });

      return false;
    }
  }
}