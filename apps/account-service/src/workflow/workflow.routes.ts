import { Router } from "express";
import { z } from "zod";
import type { WorkflowResponse } from "@todo/contracts";
import { AppError, asyncHandler, getRequestId } from "@todo/common";

import { env } from "../config/env.js";
import { requireInternalIdentity, requireInternalIdentityMiddleware } from "../security/internal-identity.js";
import { workflowRepository } from "./workflow.module.js";
import { toWorkflowView } from "./workflow.types.js";

export const workflowRouter = Router();
export const workflowHealthRouter = Router();
const workflowIdSchema = z.uuid();

workflowRouter.post(
  "/workspace-provisioning",
  requireInternalIdentityMiddleware,
  asyncHandler(async (request, response): Promise<void> => {
    const identity = requireInternalIdentity(request);
    const key = request.header("idempotency-key");
    const requestId = getRequestId();
    const body = request.body as { workspaceName?: unknown };
    if (key === undefined || key.length < 8 || key.length > 200) {
      throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required");
    }
    if (requestId === undefined) {
      throw new AppError(500, "REQUEST_CONTEXT_UNAVAILABLE", "Request context is unavailable");
    }
    if (typeof body.workspaceName !== "string" || body.workspaceName.trim().length < 1 || body.workspaceName.length > 100) {
      throw new AppError(400, "VALIDATION_ERROR", "workspaceName must contain between 1 and 100 characters");
    }
    const workflow = await workflowRepository.create({
      ownerId: identity.userId,
      idempotencyKey: key,
      correlationId: requestId,
      workspaceName: body.workspaceName.trim(),
    });
    const responseBody: WorkflowResponse = { data: { workflow: toWorkflowView(workflow) } };
    response.status(202).location(`/api/v1/workflows/${workflow.id}`).json(responseBody);
  }),
);

workflowRouter.get(
  "/:workflowId",
  requireInternalIdentityMiddleware,
  asyncHandler(async (request, response): Promise<void> => {
    const identity = requireInternalIdentity(request);
    const workflowId = request.params.workflowId;
    const parsedWorkflowId = workflowIdSchema.safeParse(workflowId);
    if (!parsedWorkflowId.success) {
      throw new AppError(400, "VALIDATION_ERROR", "workflowId must be a UUID");
    }
    const workflow = await workflowRepository.findOwned(parsedWorkflowId.data, identity.userId);
    if (workflow === null) {
      throw new AppError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found");
    }
    const responseBody: WorkflowResponse = { data: { workflow: toWorkflowView(workflow) } };
    response.status(200).json(responseBody);
  }),
);

workflowHealthRouter.get(
  "/workflows",
  asyncHandler(async (_request, response): Promise<void> => {
    const cutoff = new Date(Date.now() - env.WORKFLOW_COMPENSATION_STUCK_MS);
    const stuckCompensations = await workflowRepository.countStuckCompensations(cutoff);
    response.status(stuckCompensations === 0 ? 200 : 503).json({
      status: stuckCompensations === 0 ? "healthy" : "degraded",
      service: "account-service",
      workflows: { stuckCompensations, thresholdMilliseconds: env.WORKFLOW_COMPENSATION_STUCK_MS },
    });
  }),
);