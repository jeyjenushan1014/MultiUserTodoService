/*
It is mainly used for naming convention we used same for same concept
*/
import type {
  EventEnvelope,
} from "./event-envelope.contract.js";

export const ACCOUNT_EVENT_TYPES = {
  registered: "account.registered",
  emailChanged: "account.email-changed",
} as const;

export type AccountEventType =
  (typeof ACCOUNT_EVENT_TYPES)[
    keyof typeof ACCOUNT_EVENT_TYPES
  ];



export interface AccountEmailChangedPayload {
  readonly userId: string;
  readonly previousEmail: string;
  readonly newEmail: string;
}

export type AccountEmailChangedEvent =
  EventEnvelope<
    typeof ACCOUNT_EVENT_TYPES.emailChanged,
    AccountEmailChangedPayload
  >;

export type AccountEvent =
  | AccountEmailChangedEvent;