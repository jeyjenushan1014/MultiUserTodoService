import {
  randomUUID,
} from "node:crypto";

import type {
  WorkspaceAccount,
  WorkspaceMemberAccount,
  WorkspaceRole,
} from "@todo/contracts";

import {
  AppError,
} from "@todo/common";

import type {
  WorkspaceRepository,
} from "./workspace.repository.interface.js";

import type {
  MembershipMutationResult,
  Workspace,
} from "./workspace.types.js";

function toWorkspaceAccount(
  workspace: Workspace,
): WorkspaceAccount {
  return {
    id: workspace.id,
    name: workspace.name,
    createdBy: workspace.createdBy,
    createdAt: workspace.createdAt,
  };
}

/*
Shared by every membership mutation so a repository result is mapped
to exactly one HTTP outcome everywhere it is used, instead of each
controller re-deriving the status code (TN-5).
*/
function throwForMutationResult(
  result: MembershipMutationResult,
): never {
  if (result === "forbidden") {
    throw new AppError(
      403,
      "WORKSPACE_ACTION_FORBIDDEN",
      "You do not have permission to perform this action",
    );
  }

  if (result === "self-change") {
    throw new AppError(
      403,
      "WORKSPACE_SELF_CHANGE_FORBIDDEN",
      "You cannot change your own workspace membership through this operation",
    );
  }

  if (result === "last-administrator") {
    throw new AppError(
      409,
      "WORKSPACE_LAST_ADMINISTRATOR",
      "A workspace must keep at least one administrator",
    );
  }

  throw new AppError(
    404,
    "WORKSPACE_NOT_FOUND",
    "Workspace not found",
  );
}

export class WorkspaceService {
  public constructor(
    private readonly repository:
      WorkspaceRepository,
  ) {}

  public async createWorkspace(
    name: string,
    actorId: string,
    requestId: string,
  ): Promise<WorkspaceAccount> {
    const workspace =
      await this.repository.createWorkspace({
        id: randomUUID(),
        name,
        creatorId: actorId,
        eventId: randomUUID(),
        requestId,
        changedAt: new Date(),
      });

    return toWorkspaceAccount(workspace);
  }

  public async getWorkspace(
    workspaceId: string,
    actorId: string,
  ): Promise<WorkspaceAccount> {
    const result =
      await this.repository.findWorkspaceForActor(
        workspaceId,
        actorId,
      );

    if (result.status === "not-found") {
      throw new AppError(
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found",
      );
    }

    return toWorkspaceAccount(
      result.workspace,
    );
  }

  public async listMembers(
    workspaceId: string,
    actorId: string,
  ): Promise<readonly WorkspaceMemberAccount[]> {
    const result =
      await this.repository.listMembers(
        workspaceId,
        actorId,
      );

    if (result.status === "not-found") {
      throw new AppError(
        404,
        "WORKSPACE_NOT_FOUND",
        "Workspace not found",
      );
    }

    return result.members;
  }

  public async listWorkspacesForAccount(
    userId: string,
  ): Promise<readonly WorkspaceAccount[]> {
    const workspaces = await this.repository.listWorkspacesForUser(userId);

    return workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      createdBy: w.createdBy,
      createdAt: w.createdAt,
    }));
  }

  public async addMember(
    workspaceId: string,
    actorId: string,
    userId: string,
    role: WorkspaceRole,
    requestId: string,
  ): Promise<void> {
    const result =
      await this.repository.addMember({
        workspaceId,
        actorId,
        userId,
        role,
        eventId: randomUUID(),
        requestId,
        changedAt: new Date(),
      });

    if (result !== "changed") {
      throwForMutationResult(result);
    }
  }

  public async changeMemberRole(
    workspaceId: string,
    actorId: string,
    userId: string,
    role: WorkspaceRole,
    requestId: string,
  ): Promise<void> {
    const result =
      await this.repository.changeMemberRole({
        workspaceId,
        actorId,
        userId,
        role,
        eventId: randomUUID(),
        requestId,
        changedAt: new Date(),
      });

    if (result !== "changed") {
      throwForMutationResult(result);
    }
  }

  public async removeMember(
    workspaceId: string,
    actorId: string,
    userId: string,
    requestId: string,
  ): Promise<void> {
    const result =
      await this.repository.removeMember({
        workspaceId,
        actorId,
        userId,
        eventId: randomUUID(),
        requestId,
        changedAt: new Date(),
      });

    if (result !== "changed") {
      throwForMutationResult(result);
    }
  }
}
