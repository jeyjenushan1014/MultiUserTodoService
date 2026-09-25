import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  PostgresOwnerProjectionRepository,
} from "./owner-projection.repository.js";

import type {
  RebuildBatchBody,
  StartRebuildBody,
} from "./owner-projection-rebuild.validation.js";

const repository = new PostgresOwnerProjectionRepository();

export async function startOwnerProjectionRebuild(
  request: Request<unknown, unknown, StartRebuildBody>,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await repository.startRebuild(request.body.rebuildId);
    response.status(202).json({ rebuildId: request.body.rebuildId });
  } catch (error) {
    next(error);
  }
}

export async function applyOwnerProjectionRebuildBatch(
  request: Request<{ rebuildId: string }, unknown, RebuildBatchBody>,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await repository.applyRebuildBatch(
      request.params.rebuildId,
      request.body.users.map((user) => ({
        userId: user.userId,
        email: user.email,
        accountCreatedAt: user.accountCreatedAt,
        projectionOccurredAt: user.projectionOccurredAt,
      })),
    );

    response.status(202).json(result);
  } catch (error) {
    next(error);
  }
}

export async function completeOwnerProjectionRebuild(
  request: Request<{ rebuildId: string }>,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deactivated = await repository.completeRebuild(
      request.params.rebuildId,
    );

    response.status(200).json({ deactivated });
  } catch (error) {
    next(error);
  }
}