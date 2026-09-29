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

export interface WorkspaceMember {
  readonly userId: string;
  readonly role: WorkspaceRole;
}

/*
"not-found" covers both a workspace that does not exist and a
workspace the actor is not a member of, so a caller cannot learn a
workspace exists by the response differing (TN-12).
*/
export type WorkspaceLookupResult =
  | {
      readonly status: "found";
      readonly workspace: Workspace;
    }
  | {
      readonly status: "not-found";
    };

export type MemberListResult =
  | {
      readonly status: "found";
      readonly members: readonly WorkspaceMember[];
    }
  | {
      readonly status: "not-found";
    };
