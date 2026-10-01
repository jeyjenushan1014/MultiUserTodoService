export interface AccountDeletionRequestResponse {
  readonly data: {
    readonly deletionRequestId: string;
    readonly status: "pending";
  };
}

export interface AccountExportResponse {
  readonly data: {
    readonly generatedAt: string;
    readonly account: {
      readonly id: string;
      readonly email: string;
      readonly createdAt: string;
      readonly updatedAt: string;
    };
    readonly workspaces: readonly {
      readonly id: string;
      readonly name: string;
      readonly role: string;
      readonly createdAt: string;
    }[];
  };
}

export interface TodoExportResponse {
  readonly data: {
    readonly todos: readonly {
      readonly id: string;
      readonly ownerId: string;
      readonly title: string;
      readonly description: string | null;
      readonly state: string;
      readonly dueDate: string | null;
      readonly createdAt: string;
      readonly updatedAt: string;
      readonly deletedAt: string | null;
    }[];
    readonly shares: readonly {
      readonly id: string;
      readonly todoId: string;
      readonly ownerId: string;
      readonly recipientId: string;
      readonly permission: string;
      readonly sharedAt: string;
      readonly withdrawnAt: string | null;
    }[];
    readonly history: readonly {
      readonly id: string;
      readonly todoId: string;
      readonly actorId: string;
      readonly eventType: string;
      readonly requestId: string;
      readonly occurredAt: string;
      readonly details: Record<string, unknown>;
    }[];
  };
}