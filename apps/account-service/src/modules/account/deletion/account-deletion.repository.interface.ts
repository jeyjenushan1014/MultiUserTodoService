export interface AccountDeletionRequest {
  readonly id: string;
  readonly requestedAt: Date;
}

export interface AccountDeletionRepository {
  requestDeletion(input: {
    readonly userId: string;
    readonly idempotencyKey: string;
    readonly correlationId: string;
  }): Promise<AccountDeletionRequest>;
  claimNext(workerId: string, leaseMilliseconds: number): Promise<AccountDeletionWorkItem | null>;
  prepareWorkspaceDeletion(requestId: string): Promise<{
    readonly orphanedWorkspaceIds: readonly string[];
    readonly workspaceIds: readonly string[];
  }>;
  advance(requestId: string, currentStep: "todo-cleanup" | "account-cleanup"): Promise<void>;
  findDeletionEmail(userId: string): Promise<string>;
  hasUnpublishedIdentityEvents(userId: string, email: string): Promise<boolean>;
  complete(requestId: string): Promise<void>;
  retry(requestId: string): Promise<void>;
}

export interface AccountDeletionWorkItem {
  readonly id: string;
  readonly userId: string;
  readonly correlationId: string;
  readonly currentStep: "prepare-workspaces" | "todo-cleanup" | "account-cleanup";
  readonly orphanedWorkspaceIds: readonly string[];
  readonly workspaceIds: readonly string[];
  readonly sessionIds: readonly string[];
}