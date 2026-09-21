/*
This contracts folder mainly used to define the error response shape,healthrespose shape rather than the actual business logic.
index.ts just reexport and act as orchastrator
*/
export {
  ACCOUNT_EVENT_TYPES,
} from "./events/account-event.contract.js";

export type {
  RegisterAccountRequest,
  RegisteredAccount,
  RegisterAccountResponse,
  AccountRegisteredEvent,
  AccountRegisteredPayload,
} from "./account/index.js";

export type {
  AccountEmailChangedEvent,
  AccountEmailChangedPayload,
  AccountEvent,
  AccountEventType,
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

export type {
  AuthenticatedAccount,
  LoginAccountRequest,
  LoginAccountResponse,
} from "./account/index.js";

export type {
  RefreshSessionRequest,
  RefreshSessionResponse,
} from "./account/index.js";

export type {
  LogoutAllSessionsResponse,
  LogoutSessionResponse
} from "./account/index.js"

export type {
  CurrentAccount,
  CurrentAccountResponse,
} from "./account/index.js";