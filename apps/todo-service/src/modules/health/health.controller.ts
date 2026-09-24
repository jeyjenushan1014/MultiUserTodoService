import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  HealthResponse,
} from "@todo/contracts";

import type {
  HealthService,
} from "./health.service.js";

export class HealthController {
  public constructor(
    private readonly service:
      HealthService,
  ) {}

  public liveness = (
    _request: Request,
    response:
      Response<HealthResponse>,
  ): void => {
    response
      .status(200)
      .json(
        this.service
          .getLiveness(),
      );
  };

  public readiness = async (
    _request: Request,
    response:
      Response<HealthResponse>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result =
        await this.service
          .getReadiness();

      response
        .status(
          result.statusCode,
        )
        .json(
          result.body,
        );
    } catch (error) {
      next(error);
    }
  };
}