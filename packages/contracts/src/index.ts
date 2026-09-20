/*
This contracts folder mainly used to define the error response shape,healthrespose shape rather than the actual business logic.
index.ts just reexport and act as orchastrator
*/
export {
  ACCOUNT_EVENT_TYPES,
} from "./events/account-event.contract.js";

export type {
  AccountEmailChangedEvent,
  AccountEmailChangedPayload,
  AccountEvent,
  AccountEventType,
  AccountRegisteredEvent,
  AccountRegisteredPayload,
} from "./events/account-event.contract.js";

export type {
  EventEnvelope,
} from "./events/event-envelope.contract.js";

export type {
  ErrorDetail,
  ErrorResponse,
} from "./http/error.contract.js";

export type {
  DependencyStatus,
  HealthResponse,
  HealthStatus,
} from "./http/health.contract.js";

export type {
  CallerIdentity,
  InternalIdentityEnvelope,
} from "./identity/caller-identity.contract.js";

