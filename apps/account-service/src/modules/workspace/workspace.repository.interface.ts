import type {
  AddWorkspaceMemberData,
  ChangeWorkspaceMemberRoleData,
  CreateWorkspaceData,
  MemberListResult,
  MembershipMutationResult,
  RemoveWorkspaceMemberData,
  Workspace,
  WorkspaceLookupResult,
} from "./workspace.types.js";

export interface WorkspaceRepository {
  createWorkspace(data: CreateWorkspaceData): Promise<Workspace>;
  findWorkspaceForActor(workspaceId: string, actorId: string): Promise<WorkspaceLookupResult>;
  listMembers(workspaceId: string, actorId: string): Promise<MemberListResult>;
  listWorkspacesForUser(userId: string): Promise<readonly Workspace[]>;
  addMember(data: AddWorkspaceMemberData): Promise<MembershipMutationResult>;
  changeMemberRole(data: ChangeWorkspaceMemberRoleData): Promise<MembershipMutationResult>;
  removeMember(data: RemoveWorkspaceMemberData): Promise<MembershipMutationResult>;
}