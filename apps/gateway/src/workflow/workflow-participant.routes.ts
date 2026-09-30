import {
  timingSafeEqual,
} from "node:crypto";

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import type { WorkflowParticipationRequest } from "@todo/contracts";
import { AppError, asyncHandler } from "@todo/common";

import { env } from "../config/env.js";
import { redis } from "../config/redis.js";

export const workflowParticipantRouter = Router();

function authenticate(request: Request, _response: Response, next: NextFunction): void {
  const supplied = request.header("x-internal-service-key") ?? "";
  const expected = env.INTERNAL_SERVICE_SECRET;
  const valid = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) {
    next(new AppError(401, "UNAUTHORIZED_INTERNAL_REQUEST", "Internal request authentication failed"));
    return;
  }
  next();
}

workflowParticipantRouter.put(
  "/:workflowId",
  authenticate,
  asyncHandler(async (request, response): Promise<void> => {
    const body = request.body as WorkflowParticipationRequest;
    if (body.workflowId !== request.params.workflowId) {
      throw new AppError(400, "WORKFLOW_ID_MISMATCH", "Workflow identifier does not match the request path");
    }
    await redis.hSet(`workflow:publication:${body.workflowId}`, {
      ownerId: body.ownerId,
      workspaceName: body.workspaceName,
      correlationId: body.correlationId,
    });
    response.status(204).send();
  }),
);

workflowParticipantRouter.delete(
  "/:workflowId",
  authenticate,
  asyncHandler(async (request, response): Promise<void> => {
    const workflowId = request.params.workflowId;
    await redis.del(`workflow:publication:${typeof workflowId === "string" ? workflowId : ""}`);
    response.status(204).send();
  }),
);