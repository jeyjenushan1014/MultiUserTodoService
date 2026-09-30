import type {
  WorkflowStepName,
} from "@todo/contracts";

import {
  logger,
} from "../config/logger.js";

import {
  env,
} from "../config/env.js";

import type {
  WorkflowParticipant,
  WorkflowRecord,
  WorkflowRepository,
} from "./workflow.types.js";

export const WORKFLOW_MAX_ATTEMPTS = 3;

const STEP_ORDER: readonly WorkflowStepName[] = [
  "account-reservation",
  "todo-reservation",
  "gateway-publication",
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown participant failure";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

export class WorkflowOrchestrator {
  public constructor(
    private readonly repository: WorkflowRepository,
    private readonly participants: Readonly<Record<WorkflowStepName, WorkflowParticipant>>,
    private readonly maxAttempts = WORKFLOW_MAX_ATTEMPTS,
  ) {}

  public async run(workflow: WorkflowRecord): Promise<void> {
    if (workflow.status === "completed" || workflow.status === "compensated" || workflow.status === "compensation_failed") {
      return;
    }

    if (workflow.status === "compensating") {
      await this.compensate(workflow);
      return;
    }

    for (const step of STEP_ORDER) {
      const savedStep = workflow.steps.find((candidate) => candidate.name === step);
      if (savedStep?.status === "applied") {
        continue;
      }

      await this.repository.beginStep(workflow.id, step, false);
      try {
        if (env.WORKFLOW_STEP_DELAY_MS > 0) {
          await wait(env.WORKFLOW_STEP_DELAY_MS);
        }
        await this.participants[step].apply(workflow);
        await this.repository.finishStep(workflow.id, step, false);
        logger.info({ workflowId: workflow.id, correlationId: workflow.correlationId, workflowStep: step }, "Workflow step applied");
      } catch (error) {
        const attempts = await this.repository.recordFailure(workflow.id, step, false, errorMessage(error));
        logger.warn({ error, workflowId: workflow.id, correlationId: workflow.correlationId, workflowStep: step, attempts }, "Workflow step failed");
        if (attempts >= this.maxAttempts) {
          await this.repository.setStatus(workflow.id, "compensating", step);
        } else {
          await this.repository.setStatus(workflow.id, "running", step, attempts * 1_000);
        }
        return;
      }
    }

    await this.repository.setStatus(workflow.id, "completed", null);
    logger.info({ workflowId: workflow.id, correlationId: workflow.correlationId }, "Workflow completed");
  }

  private async compensate(workflow: WorkflowRecord): Promise<void> {
    const reverseSteps = [...STEP_ORDER].reverse();
    for (const step of reverseSteps) {
      const savedStep = workflow.steps.find((candidate) => candidate.name === step);
      if (savedStep?.status !== "applied" && savedStep?.status !== "compensating" && savedStep?.status !== "failed") {
        continue;
      }

      await this.repository.beginStep(workflow.id, step, true);
      try {
        await this.participants[step].compensate(workflow);
        await this.repository.finishStep(workflow.id, step, true);
        logger.info({ workflowId: workflow.id, correlationId: workflow.correlationId, workflowStep: step }, "Workflow step compensated");
      } catch (error) {
        const attempts = await this.repository.recordFailure(workflow.id, step, true, errorMessage(error));
        const status = attempts >= this.maxAttempts ? "compensation_failed" : "compensating";
        await this.repository.setStatus(workflow.id, status, step, attempts * 1_000);
        logger.error({ error, workflowId: workflow.id, correlationId: workflow.correlationId, workflowStep: step, attempts }, "Workflow compensation failed");
        return;
      }
    }
    await this.repository.setStatus(workflow.id, "compensated", null);
    logger.info({ workflowId: workflow.id, correlationId: workflow.correlationId }, "Workflow compensation completed");
  }
}