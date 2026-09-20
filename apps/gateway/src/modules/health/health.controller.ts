import type {
  RequestHandler,
} from "express";

import {
  getGatewayHealth,
} from "./health.service.js";

export const getLiveness:
RequestHandler = (
  _request,
  response,
): void => {
  response.status(200).json({
    status: "alive",
    service: "gateway",
  });
};

export const getReadiness:
RequestHandler = async (
  _request,
  response,
): Promise<void> => {
  const health =
    await getGatewayHealth();

  const ready =
    health.dependencies.redis.status ===
      "available";

  response
    .status(
      ready ? 200 : 503,
    )
    .json({
      status: ready
        ? "ready"
        : "not-ready",

      service: "gateway",

      dependencies:
        health.dependencies,
    });
};

export const getHealth:
RequestHandler = async (
  _request,
  response,
): Promise<void> => {
  const health =
    await getGatewayHealth();

  response
    .status(
      health.status === "healthy"
        ? 200
        : 503,
    )
    .json(health);
};