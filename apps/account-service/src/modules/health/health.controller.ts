import type {
  RequestHandler,
} from "express";

import {
  asyncHandler,
} from "@todo/common";

import {
  getAccountServiceHealth,
} from "./health.service.js";

const handleGetHealth:
  RequestHandler = async (
    _request,
    response,
  ): Promise<void> => {
    const health =
      await getAccountServiceHealth();

    const statusCode =
      health.status ===
      "healthy"
        ? 200
        : 503;

    response
      .status(statusCode)
      .json(health);
  };

export const getHealthController =
  asyncHandler(
    handleGetHealth,
  );