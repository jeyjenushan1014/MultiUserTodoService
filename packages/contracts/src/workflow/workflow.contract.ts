export const WORKFLOW_STEP_NAMES = [
  "account-reservation",
  "todo-reservation",
  "gateway-publication",
] as const;

export type WorkflowStepName =
  (typeof WORKFLOW_STEP_NAMES)[number];

export type WorkflowStatus =
  | "running"
  | "compensating"
  | "completed"
  | "compensated"
  | "compensation_failed";

export type WorkflowStepStatus =
  | "pending"
  | "applying"
  | "applied"
  | "compensating"
  | "compensated"
  | "failed";

export interface StartWorkspaceProvisioningRequest {
  readonly workspaceName: string;
}

export interface WorkflowStepView {
  readonly name: WorkflowStepName;
  readonly status: WorkflowStepStatus;
  readonly attempts: number;
  readonly compensationAttempts: number;
  readonly lastError: string | null;
}

export interface WorkflowView {
  readonly id: string;
  readonly kind: "workspace-provisioning";
  readonly status: WorkflowStatus;
  readonly currentStep: WorkflowStepName | null;
  readonly unwinding: boolean;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: readonly WorkflowStepView[];
}

export interface WorkflowResponse {
  readonly data: {
    readonly workflow: WorkflowView;
  };
}

export interface WorkflowParticipationRequest {
  readonly workflowId: string;
  readonly ownerId: string;
  readonly workspaceName: string;
  readonly correlationId: string;
}