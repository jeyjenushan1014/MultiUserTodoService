import type {
  WorkflowParticipationRequest,
  WorkflowStepName,
} from "@todo/contracts";

import {
  database,
} from "../config/database.js";
import {
  env,
} from "../config/env.js";

import type {
  WorkflowParticipant,
  WorkflowRecord,
} from "./workflow.types.js";

class AccountReservationParticipant implements WorkflowParticipant {
  public async apply(workflow: WorkflowRecord): Promise<void> {
    await database.query(
      `INSERT INTO workspace_provisioning_reservations (workflow_id, owner_id, workspace_name)
       VALUES ($1, $2, $3) ON CONFLICT (workflow_id) DO NOTHING`,
      [workflow.id, workflow.ownerId, workflow.workspaceName],
    );
  }

  public async compensate(workflow: WorkflowRecord): Promise<void> {
    await database.query("DELETE FROM workspace_provisioning_reservations WHERE workflow_id = $1", [workflow.id]);
  }
}

class HttpParticipant implements WorkflowParticipant {
  public constructor(private readonly baseUrl: string) {}

  public async apply(workflow: WorkflowRecord): Promise<void> {
    const body: WorkflowParticipationRequest = {
      workflowId: workflow.id,
      ownerId: workflow.ownerId,
      workspaceName: workflow.workspaceName,
      correlationId: workflow.correlationId,
    };
    await this.send(workflow, "PUT", body);
  }

  public async compensate(workflow: WorkflowRecord): Promise<void> {
    await this.send(workflow, "DELETE");
  }

  private async send(workflow: WorkflowRecord, method: "PUT" | "DELETE", body?: WorkflowParticipationRequest): Promise<void> {
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(2_000),
      headers: {
        "content-type": "application/json",
        "x-internal-service-key": env.INTERNAL_SERVICE_SECRET,
        "x-request-id": workflow.correlationId,
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(`${this.baseUrl}/internal/v1/workflow-participations/${workflow.id}`, init);
    if (!response.ok) {
      throw new Error(`Workflow participant returned HTTP ${response.status}`);
    }
  }
}

export const workflowParticipants: Readonly<Record<WorkflowStepName, WorkflowParticipant>> = {
  "account-reservation": new AccountReservationParticipant(),
  "todo-reservation": new HttpParticipant(env.TODO_SERVICE_URL),
  "gateway-publication": new HttpParticipant(env.GATEWAY_URL),
};