import type {
  WorkflowStatus,
  WorkflowStepName,
  WorkflowStepStatus,
  WorkflowView,
} from "@todo/contracts";

export interface WorkflowStepRecord {
  readonly name: WorkflowStepName;
  readonly status: WorkflowStepStatus;
  readonly attempts: number;
  readonly compensationAttempts: number;
  readonly lastError: string | null;
}

export interface WorkflowRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly workspaceName: string;
  readonly status: WorkflowStatus;
  readonly currentStep: WorkflowStepName | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly steps: readonly WorkflowStepRecord[];
}

export interface WorkflowRepository {
  create(input: {
    ownerId: string;
    idempotencyKey: string;
    correlationId: string;
    workspaceName: string;
  }): Promise<WorkflowRecord>;
  findOwned(id: string, ownerId: string): Promise<WorkflowRecord | null>;
  find(id: string): Promise<WorkflowRecord | null>;
  claimNext(workerId: string, leaseMilliseconds: number): Promise<WorkflowRecord | null>;
  beginStep(id: string, step: WorkflowStepName, compensating: boolean): Promise<void>;
  finishStep(id: string, step: WorkflowStepName, compensating: boolean): Promise<void>;
  recordFailure(id: string, step: WorkflowStepName, compensating: boolean, message: string): Promise<number>;
  setStatus(id: string, status: WorkflowStatus, currentStep: WorkflowStepName | null, delayMilliseconds?: number): Promise<void>;
  countStuckCompensations(olderThan: Date): Promise<number>;
}

export interface WorkflowParticipant {
  apply(workflow: WorkflowRecord): Promise<void>;
  compensate(workflow: WorkflowRecord): Promise<void>;
}

export function toWorkflowView(record: WorkflowRecord): WorkflowView {
  return {
    id: record.id,
    kind: "workspace-provisioning",
    status: record.status,
    currentStep: record.currentStep,
    unwinding: record.status === "compensating" || record.status === "compensation_failed",
    correlationId: record.correlationId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    steps: record.steps,
  };
}