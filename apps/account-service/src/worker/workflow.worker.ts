import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { WorkflowOrchestrator } from "../workflow/workflow.orchestrator.js";
import { workflowParticipants } from "../workflow/workflow.participants.js";
import { workflowRepository } from "../workflow/workflow.module.js";

const orchestrator = new WorkflowOrchestrator(workflowRepository, workflowParticipants);
let stopping = false;

async function poll(): Promise<void> {
  while (!stopping) {
    try {
      const workflow = await workflowRepository.claimNext(env.WORKFLOW_WORKER_ID, env.WORKFLOW_LEASE_MS);
      if (workflow === null) {
        await new Promise((resolve) => setTimeout(resolve, env.WORKFLOW_POLL_INTERVAL_MS));
      } else {
        await orchestrator.run(workflow);
      }
    } catch (error) {
      logger.error({ error }, "Workflow worker poll failed");
      await new Promise((resolve) => setTimeout(resolve, env.WORKFLOW_POLL_INTERVAL_MS));
    }
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, (): void => { stopping = true; });
}

void poll();