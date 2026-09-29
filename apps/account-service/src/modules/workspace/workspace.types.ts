import type {
  WorkspaceRole,
} from "@todo/contracts";

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CreateWorkspaceData {
  readonly id: string;
  readonly name: string;
  readonly creatorId: string;
  readonly createdAt: Date;
}

export interface AddWorkspaceMemberData {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly userId: string;
  readonly role: WorkspaceRole;
  readonly changedAt: Date;
}

export interface ChangeWorkspaceMemberRoleData
extends AddWorkspaceMemberData {}

export interface RemoveWorkspaceMemberData {
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