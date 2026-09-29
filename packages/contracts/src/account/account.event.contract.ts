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

/*
A null sessionId means every session for userId is revoked
as of revokedAt, rather than one specific session.
*/
export interface AccountSessionRevokedPayload {
  readonly userId: string;
  readonly sessionId: string | null;
  readonly revokedAt: string;
}

export type AccountSessionRevokedEvent =
  EventEnvelope<
    "account.session-revoked",
    AccountSessionRevokedPayload
  >;