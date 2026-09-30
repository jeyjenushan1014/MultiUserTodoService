import {
  timingSafeEqual,
} from "node:crypto";

import type {
  NextFunction,
  Request,
  Response,
} from "express";
import {
  Router,
} from "express";

import type {
  WorkflowParticipationRequest,
} from "@todo/contracts";
import {
  AppError,
  asyncHandler,
} from "@todo/common";

import {
  database,
} from "../config/database.js";
import {
  env,
} from "../config/env.js";

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
    await database.query(
      `INSERT INTO workflow_reservations (workflow_id, owner_id, workspace_name, correlation_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT (workflow_id) DO NOTHING`,
      [body.workflowId, body.ownerId, body.workspaceName, body.correlationId],
    );
    response.status(204).send();
  }),
);

workflowParticipantRouter.delete(
  "/:workflowId",
  authenticate,
  asyncHandler(async (request, response): Promise<void> => {
    await database.query("DELETE FROM workflow_reservations WHERE workflow_id = $1", [request.params.workflowId]);
    response.status(204).send();
  }),
);