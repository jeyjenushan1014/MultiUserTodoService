export interface EventEnvelope<
  TType extends string,
  TPayload,
> {
  readonly eventId: string;
  readonly eventType: TType;
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly requestId: string;
  readonly producer: string;
  readonly payload: TPayload;
}