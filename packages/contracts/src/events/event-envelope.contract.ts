/*
Generic type of the event type. It is mainy used for payload could be safe for the relationship type
*/

export interface EventEnvelope<
  TEventType extends string,
  TPayload,
> {
  readonly eventId: string;
  readonly eventType: TEventType;
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly requestId: string;
  readonly producer: string;
  readonly payload: TPayload;
}