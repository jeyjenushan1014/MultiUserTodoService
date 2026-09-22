import type {
  OutboxEvent,
  OutboxFailure,
} from "./outbox.types.js";

export interface OutboxRepository {
  claimPendingEvents(
    workerId: string,
    batchSize: number,
    lockTimeoutSeconds: number,
  ): Promise<readonly OutboxEvent[]>;

  markPublished(
    eventId: string,
    workerId: string,
    publishedAt: Date,
  ): Promise<void>;

  markFailed(
    failure: OutboxFailure,
    workerId: string,
  ): Promise<void>;

  releaseWorkerLocks(
    workerId: string,
  ): Promise<void>;
}