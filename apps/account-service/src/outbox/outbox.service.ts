import {
  env,
} from "../config/env.js";

import {
  logger,
} from "../config/logger.js";

import {
  runWithRequestContext,
} from "@todo/common";

import type {
  EventPublisher,
} from "./event-publisher.interface.js";

import type {
  OutboxRepository,
} from "./outbox.repository.interface.js";

import type {
  OutboxEvent,
  PublishedEventEnvelope,
} from "./outbox.types.js";

import {
  calculateNextAttemptAt,
} from "./retry-policy.js";

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message
      .slice(0, 2000);
  }

  return "Unknown event publishing error";
}

export function createEnvelope(
  event: OutboxEvent,
): PublishedEventEnvelope {
  return {
    eventId:
      event.id,

    eventType:
      event.eventType,

    eventVersion:
      event.eventVersion,



    occurredAt:
      event.occurredAt.toISOString(),

    requestId:
      event.requestId,

    producer:
      "account-service",

    payload:
      event.payload,
  };
}

export interface ProcessBatchResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

export class OutboxService {
  public constructor(
    private readonly repository:
      OutboxRepository,

    private readonly publisher:
      EventPublisher,

    private readonly workerId:
      string,
  ) {}

  public async processBatch():
  Promise<ProcessBatchResult> {
    const events =
      await this.repository
        .claimPendingEvents(
          this.workerId,
          env.OUTBOX_BATCH_SIZE,
          env.OUTBOX_LOCK_TIMEOUT_SECONDS,
        );

    let published = 0;
    let failed = 0;

    for (const event of events) {
      await runWithRequestContext(
        {
          requestId: event.requestId,
          serviceName: "account-service",
        },
        async () => {
          try {
            await this.publisher.publish(
              createEnvelope(event),
            );

            await this.repository
              .markPublished(
                event.id,
                this.workerId,
                new Date(),
              );

            published += 1;

            logger.info(
              {
                eventId:
                  event.id,

                eventType:
                  event.eventType,

                aggregateId:
                  event.aggregateId,
              },
              "Outbox event published",
            );
          } catch (error) {
            const now =
              new Date();

            await this.repository
              .markFailed(
                {
                  eventId:
                    event.id,

                  errorMessage:
                    getErrorMessage(error),

                  nextAttemptAt:
                    calculateNextAttemptAt(
                      now,
                      event.publishAttempts,
                      env
                        .OUTBOX_MAX_RETRY_DELAY_SECONDS,
                    ),
                },
                this.workerId,
              );

            failed += 1;

            logger.warn(
              {
                err: error,

                eventId:
                  event.id,

                eventType:
                  event.eventType,

                completedAttempts:
                  event.publishAttempts +
                  1,
              },
              "Outbox event publishing failed",
            );
          }
        },
      );
    }

    return {
      claimed:
        events.length,

      published,

      failed,
    };
  }

  public async releaseLocks():
  Promise<void> {
    await this.repository
      .releaseWorkerLocks(
        this.workerId,
      );
  }
}