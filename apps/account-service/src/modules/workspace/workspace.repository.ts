import type {
  PoolClient,
} from "pg";

import {
  canPerform,
} from "@todo/contracts";

import {
  database,
} from "../../config/database.js";

import {
  logger,
} from "../../config/logger.js";

import type {
  WorkspaceRepository,
} from "./workspace.repository.interface.js";

import type {
  AddWorkspaceMemberData,
  ChangeWorkspaceMemberRoleData,
  CreateWorkspaceData,
  MembershipDatabaseRow,
  MembershipMutationResult,
  RemoveWorkspaceMemberData,
  Workspace,
  WorkspaceDatabaseRow,
} from "./workspace.types.js";

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch (error: unknown) {
    logger.error({error}, "Failed to rollback workspace transaction");
  }
}

async function lockWorkspace(
  client: PoolClient,
  workspaceId: string,
): Promise<boolean> {
  const result = await client.query<{readonly id: string}>(
    "SELECT id FROM workspaces WHERE id = $1 FOR UPDATE",
    [workspaceId],
  );
  return result.rowCount === 1;
}

async function findMembership(
  client: PoolClient,
  workspaceId: string,
  userId: string,
): Promise<MembershipDatabaseRow | undefined> {
  const result = await client.query<MembershipDatabaseRow>(
    `
      SELECT user_id, role
      FROM workspace_members
      WHERE workspace_id = $1 AND user_id = $2
    `,
    [workspaceId, userId],
  );
  return result.rows[0];
}

async function hasAnotherAdministrator(
  client: PoolClient,
  workspaceId: string,
  excludedUserId: string,
): Promise<boolean> {
  const result = await client.query<{readonly present: boolean}>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = $1
          AND role = 'administrator'
          AND user_id <> $2
      ) AS present
    `,
    [workspaceId, excludedUserId],
  );
  return result.rows[0]?.present === true;
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  public async createWorkspace(data: CreateWorkspaceData): Promise<Workspace> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<WorkspaceDatabaseRow>(
        `
          INSERT INTO workspaces (id, name, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
          RETURNING id, name, created_by, created_at
        `,
        [data.id, data.name, data.creatorId, data.createdAt],
      );
      const workspace = result.rows[0];
      if (workspace === undefined) {
        throw new Error("Workspace insert returned no row");
      }
      await client.query(
        `
          INSERT INTO workspace_members (
            workspace_id, user_id, role, created_at, updated_at
          )
          VALUES ($1, $2, 'administrator', $3, $3)
        `,
        [data.id, data.creatorId, data.createdAt],
      );
      await client.query("COMMIT");
      return {
        id: workspace.id,
        name: workspace.name,
        createdBy: workspace.created_by,
        createdAt: workspace.created_at.toISOString(),
      };
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async addMember(
    data: AddWorkspaceMemberData,
  ): Promise<MembershipMutationResult> {
    if (data.actorId === data.userId) return "self-change";
    return this.withLockedWorkspace(data.workspaceId, async (client) => {
      const actor = await findMembership(client, data.workspaceId, data.actorId);
      if (actor === undefined || !canPerform(actor.role, "member.add")) {
        return "forbidden";
      }
      const result = await client.query(
        `
          INSERT INTO workspace_members (
            workspace_id, user_id, role, created_at, updated_at
          )
          SELECT $1, users.id, $3, $4, $4
          FROM users
          WHERE users.id = $2
          ON CONFLICT (workspace_id, user_id) DO NOTHING
        `,
        [data.workspaceId, data.userId, data.role, data.changedAt],
      );
      return result.rowCount === 1 ? "changed" : "not-found";
    });
  }

  public async changeMemberRole(
    data: ChangeWorkspaceMemberRoleData,
  ): Promise<MembershipMutationResult> {
    if (data.actorId === data.userId) return "self-change";
    return this.withLockedWorkspace(data.workspaceId, async (client) => {
      const actor = await findMembership(client, data.workspaceId, data.actorId);
      if (actor === undefined || !canPerform(actor.role, "member.change-role")) {
        return "forbidden";
      }
      const target = await findMembership(client, data.workspaceId, data.userId);
      if (target === undefined) return "not-found";
      if (
        target.role === "administrator" &&
        data.role !== "administrator" &&
        !(await hasAnotherAdministrator(client, data.workspaceId, data.userId))
      ) {
        return "last-administrator";
      }
      await client.query(
        `
          UPDATE workspace_members
          SET role = $3, updated_at = $4
          WHERE workspace_id = $1 AND user_id = $2
        `,
        [data.workspaceId, data.userId, data.role, data.changedAt],
      );
      return "changed";
    });
  }

  public async removeMember(
    data: RemoveWorkspaceMemberData,
  ): Promise<MembershipMutationResult> {
    if (data.actorId === data.userId) return "self-change";
    return this.withLockedWorkspace(data.workspaceId, async (client) => {
      const actor = await findMembership(client, data.workspaceId, data.actorId);
      if (actor === undefined || !canPerform(actor.role, "member.remove")) {
        return "forbidden";
      }
      const target = await findMembership(client, data.workspaceId, data.userId);
      if (target === undefined) return "not-found";
      if (
        target.role === "administrator" &&
        !(await hasAnotherAdministrator(client, data.workspaceId, data.userId))
      ) {
        return "last-administrator";
      }
      await client.query(
        "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [data.workspaceId, data.userId],
      );
      return "changed";
    });
  }

  private async withLockedWorkspace(
    workspaceId: string,
    operation: (client: PoolClient) => Promise<MembershipMutationResult>,
  ): Promise<MembershipMutationResult> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      if (!(await lockWorkspace(client, workspaceId))) {
        await client.query("ROLLBACK");
        return "not-found";
      }
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}