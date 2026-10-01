import amqp from "amqplib";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { PostgresAccountDeletionRepository } from "../modules/account/deletion/account-deletion.repository.js";
import type { AccountDeletionWorkItem } from "../modules/account/deletion/account-deletion.repository.interface.js";
import { purgeQueueMessages } from "./account-deletion.broker.js";

const repository = new PostgresAccountDeletionRepository();

async function purgeAccountMessages(userId: string, email: string): Promise<void> {
  const connection = await amqp.connect(env.RABBITMQ_URL);
  try {
    for (const queue of env.ACCOUNT_DELETION_BROKER_QUEUES.split(",").map((value) => value.trim()).filter(Boolean)) {
      const channel = await connection.createConfirmChannel();
      try {
        await purgeQueueMessages(channel, queue, userId, email);
      } finally {
        await channel.close();
      }
    }
  } finally {
    await connection.close();
  }
}

async function eraseTodoCopies(work: AccountDeletionWorkItem): Promise<void> {
  const response = await fetch(
    new URL("/internal/v1/account-deletions", env.TODO_SERVICE_URL),
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-internal-service-key": env.INTERNAL_SERVICE_SECRET,
        "x-request-id": work.correlationId,
      },
      body: JSON.stringify({ userId: work.userId, orphanedWorkspaceIds: work.orphanedWorkspaceIds, workspaceIds: work.workspaceIds }),
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (response.status !== 204) {
    throw new Error("Todo erasure participant rejected the request");
  }
}

async function purgeTodoCaches(work: AccountDeletionWorkItem): Promise<void> {
  const response = await fetch(new URL("/internal/v1/account-deletions/cache", env.TODO_SERVICE_URL), {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-internal-service-key": env.INTERNAL_SERVICE_SECRET,
      "x-request-id": work.correlationId,
    },
    body: JSON.stringify({ userId: work.userId, workspaceIds: work.workspaceIds }),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status !== 204) {
    throw new Error("Todo cache erasure participant rejected the request");
  }
}

async function purgeGatewayCaches(work: AccountDeletionWorkItem): Promise<void> {
  const response = await fetch(
    new URL("/internal/v1/account-deletions/cache", env.GATEWAY_URL),
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-internal-service-key": env.INTERNAL_SERVICE_SECRET,
        "x-request-id": work.correlationId,
      },
      body: JSON.stringify({ userId: work.userId, workspaceIds: work.workspaceIds, sessionIds: work.sessionIds }),
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (response.status !== 204) {
    throw new Error("Gateway erasure participant rejected the request");
  }
}

export async function processNextAccountDeletion(
  workerId: string,
  leaseMilliseconds: number,
): Promise<boolean> {
  const work = await repository.claimNext(workerId, leaseMilliseconds);
  if (work === null) {
    return false;
  }

  let currentWork = work;
  let step = work.currentStep;
  try {
    if (step === "prepare-workspaces") {
      const workspacePlan = await repository.prepareWorkspaceDeletion(work.id);
      currentWork = { ...work, ...workspacePlan };
      step = "todo-cleanup";
    }
    if (step === "todo-cleanup") {
      await eraseTodoCopies(currentWork);
      await repository.advance(work.id, "account-cleanup");
      step = "account-cleanup";
    }
    const email = await repository.findDeletionEmail(work.userId);
    const hasPendingEvents = await repository.hasUnpublishedIdentityEvents(work.userId, email);
    switch (hasPendingEvents) {
      case true:
        throw new Error("Account events are still pending delivery");
      case false:
        break;
    }
    await purgeAccountMessages(work.userId, email);
    await purgeTodoCaches(currentWork);
    await purgeGatewayCaches(currentWork);
    await repository.complete(work.id);
  } catch (error) {
    logger.warn(
      { error, deletionRequestId: work.id, workflowStep: step },
      "Account deletion step failed; it will retry",
    );
    await repository.retry(work.id);
  }

  return true;
}