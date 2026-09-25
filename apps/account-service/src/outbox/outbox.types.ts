export interface OutboxEvent {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: unknown;
  readonly requestId: string;
  readonly occurredAt: Date;
  readonly publishAttempts: number;
}

export interface PublishedEventEnvelope {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly requestId: string;
  readonly producer: "account-service";
  readonly payload: unknown;
}

export interface OutboxFailure {
  readonly eventId: string;
  readonly errorMessage: string;
  readonly nextAttemptAt: Date;
}