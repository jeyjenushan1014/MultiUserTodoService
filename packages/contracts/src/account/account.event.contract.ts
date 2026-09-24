import type { EventEnvelope } from "../events/event-envelope.contract.js"

export interface AccountRegisteredPayload {
  readonly userId: string;
  readonly email: string;
}

export type AccountRegisteredEvent =
  EventEnvelope<
    "account.registered",
    AccountRegisteredPayload
  >;

  export interface AccountEmailChangedPayload {
  readonly userId: string;
  readonly email: string;
}

export type AccountEmailChangedEvent =
  EventEnvelope<
    "account.email-changed",
    AccountEmailChangedPayload
  >;