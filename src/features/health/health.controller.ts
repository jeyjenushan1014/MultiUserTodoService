import type { RequestHandler } from "express";
import * as healthService from "./health.service.js";

export const getHealth: RequestHandler = async (
  _request,
  response,
) => {
  const result = await healthService.checkHealth();

  const statusCode =
    result.checks.database === "available"
      ? 200
      : 503;

  response.status(statusCode).json({
    data: result,
  });
};