/*
health: it means the service is working and all the dependencies are also working correctly
degraded means service working but dependencies are partially available
unhealth: it means service is not working correctly
*/
export type HealthStatus =
  | "healthy"
  | "degraded"
  | "unhealthy";

export type DependencyStatus =
  | "available"
  | "unavailable";

export interface HealthResponse {
  readonly status: HealthStatus;
  readonly service: string;

  readonly dependencies?: Readonly<
    Record<string, DependencyStatus>
  >;
}