import type {
  RequestHandler,
} from "express";

import {
  getGatewayHealth,
  getGatewayDependencyHealth,
} from "./health.service.js";

export const getHealthController:
  RequestHandler = (
    _request,
    response,
  ): void => {
    const health =
      getGatewayHealth();

    response
      .status(200)
      .json(health);
  };

export const getDependencyHealthController:
  RequestHandler = async (
    _request,
    response,
  ): Promise<void> => {
    const health =
      await getGatewayDependencyHealth();

    response
      .status(
        health.status ===
          "healthy"
          ? 200
          : 503,
      )
      .json(health);
  };