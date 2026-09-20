/*
This contracts folder mainly used to define the error response shape,healthrespose shape rather than the actual business logic.
index.ts just reexport and act as orchastrator
*/
export type {
  ErrorDetail,
  ErrorResponse,
} from "./http/error.contract.js";

export type {
  DependencyStatus,
  HealthResponse,
  HealthStatus,
} from "./http/health.contract.js";

