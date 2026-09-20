import type {
  HealthResponse,
} from "@todo/contracts";

export function getGatewayHealth():
  HealthResponse {
  return {
    status: "healthy",
    service: "gateway",
  };
}