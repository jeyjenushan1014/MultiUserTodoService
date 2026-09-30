import { Router } from "express";
import type { StartWorkspaceProvisioningRequest } from "@todo/contracts";
import { AppError, asyncHandler, getRequestId } from "@todo/common";

import { getWorkflow, startWorkspaceProvisioning } from "../../clients/account-service.client.js";
import { authenticate, getCallerIdentity } from "../../middleware/authenticate.middleware.js";

export const workflowRouter = Router();

function requestId(): string {
  const value = getRequestId();
  if (value === undefined) throw new AppError(500, "REQUEST_CONTEXT_MISSING", "Request context is unavailable");
  return value;
}

workflowRouter.post(
  "/workspace-provisioning",
  authenticate,
  asyncHandler(async (request, response): Promise<void> => {
    const key = request.header("idempotency-key");
    if (key === undefined) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key header is required");
    const result = await startWorkspaceProvisioning(
      getCallerIdentity(response),
      request.body as StartWorkspaceProvisioningRequest,
      key,
      requestId(),
    );
    response.status(202).location(`/api/v1/workflows/${result.data.workflow.id}`).json(result);
  }),
);

workflowRouter.get(
  "/:workflowId",
  authenticate,
  asyncHandler(async (request, response): Promise<void> => {
    const workflowId = request.params.workflowId;
    const result = await getWorkflow(getCallerIdentity(response), typeof workflowId === "string" ? workflowId : "", requestId());
    response.status(200).json(result);
  }),
);