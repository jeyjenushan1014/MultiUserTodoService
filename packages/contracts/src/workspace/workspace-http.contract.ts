import type {
  WorkspaceRole,
} from "../authorization/index.js";

export interface WorkspaceIdParams {
  readonly workspaceId: string;
}

export interface WorkspaceMemberParams {
  readonly workspaceId: string;
  readonly userId: string;
}

export interface CreateWorkspaceRequest {
  readonly name: string;
}

export interface WorkspaceAccount {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface WorkspaceResponse {
  readonly data: {
    readonly workspace: WorkspaceAccount;
  };
}

export interface WorkspaceMemberAccount {
  readonly userId: string;
  readonly role: WorkspaceRole;
}

export interface ListWorkspaceMembersResponse {
  readonly data: {
    readonly members: readonly WorkspaceMemberAccount[];
  };
}

export interface AddWorkspaceMemberRequest {
  readonly userId: string;
  readonly role: WorkspaceRole;
}

export interface ChangeWorkspaceMemberRoleRequest {
  readonly role: WorkspaceRole;
}

export interface WorkspaceMemberResponse {
  readonly data: {
    readonly member: WorkspaceMemberAccount;
  };
}
