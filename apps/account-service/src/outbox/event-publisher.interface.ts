import type {
  PublishedEventEnvelope,
} from "./outbox.types.js";

export interface EventPublisher {
  connect(): Promise<void>;

  publish(
    event: PublishedEventEnvelope,
  ): Promise<void>;

  close(): Promise<void>;

  readonly ready: boolean;
}