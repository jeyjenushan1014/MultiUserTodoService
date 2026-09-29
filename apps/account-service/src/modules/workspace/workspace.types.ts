import type {
  WorkspaceRole,
} from "@todo/contracts";

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface WorkspaceEventMetadata {
  readonly eventId: string;
  readonly requestId: string;
  readonly changedAt: Date;
}

export interface CreateWorkspaceData
extends WorkspaceEventMetadata {
  readonly id: string;
  readonly name: string;
  readonly creatorId: string;
}

export interface AddWorkspaceMemberData
extends WorkspaceEventMetadata {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly userId: string;
  readonly role: WorkspaceRole;
}

export type ChangeWorkspaceMemberRoleData =
  AddWorkspaceMemberData;

export interface RemoveWorkspaceMemberData
extends WorkspaceEventMetadata {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly userId: string;
}

export type MembershipMutationResult =
  | "changed"
  | "forbidden"
  | "not-found"
  | "self-change"
  | "last-administrator";

export interface WorkspaceDatabaseRow {
  readonly id: string;
  readonly name: string;
  readonly created_by: string;
  readonly created_at: Date;
}

export interface MembershipDatabaseRow {
  readonly user_id: string;
  readonly role: WorkspaceRole;
}
