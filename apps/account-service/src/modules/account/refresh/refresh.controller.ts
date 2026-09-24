import type {
  RequestHandler,
} from "express";

import type {
  RefreshSessionInput,
} from "./refresh.validation.js";

import type {
  RefreshService,
} from "./refresh.service.js";

export function createRefreshController(
  refreshService: RefreshService,
): RequestHandler {
  return async (
    request,
    response,
  ): Promise<void> => {
    const result =
      await refreshService.refresh(
        request.body as
          RefreshSessionInput,
      );

    response
      .status(200)
      .json(result);
  };
}