import type {
  AddWorkspaceMemberData,
  ChangeWorkspaceMemberRoleData,
  CreateWorkspaceData,
  MembershipMutationResult,
  RemoveWorkspaceMemberData,
  Workspace,
} from "./workspace.types.js";

export interface WorkspaceRepository {
  createWorkspace(data: CreateWorkspaceData): Promise<Workspace>;
  addMember(data: AddWorkspaceMemberData): Promise<MembershipMutationResult>;
  changeMemberRole(data: ChangeWorkspaceMemberRoleData): Promise<MembershipMutationResult>;
  removeMember(data: RemoveWorkspaceMemberData): Promise<MembershipMutationResult>;
}