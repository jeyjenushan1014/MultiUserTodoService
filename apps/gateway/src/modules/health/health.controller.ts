import type {
  RequestHandler,
} from "express";

import {
  getGatewayHealth,
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