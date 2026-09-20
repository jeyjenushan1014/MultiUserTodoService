import type {
  EventEnvelope,
} from "./event-envelope.js";

export interface AccountRegisteredPayload {
  readonly userId: string;
  readonly email: string;
}

export interface AccountEmailChangedPayload {
  readonly userId: string;
  readonly email: string;
}

export interface PasswordResetRequestedPayload {
  readonly userId: string;
  readonly encryptedResetToken: string;
}

export type AccountRegisteredEvent =
  EventEnvelope<
    "account.registered.v1",
    AccountRegisteredPayload
  >;

export type AccountEmailChangedEvent =
  EventEnvelope<
    "account.email-changed.v1",
    AccountEmailChangedPayload
  >;

export type PasswordResetRequestedEvent =
  EventEnvelope<
    "account.password-reset-requested.v1",
    PasswordResetRequestedPayload
  >;