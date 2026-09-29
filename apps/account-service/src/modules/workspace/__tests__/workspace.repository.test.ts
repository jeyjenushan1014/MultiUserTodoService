import {beforeEach, describe, expect, it, vi} from "vitest";

import {PostgresWorkspaceRepository} from "../workspace.repository.js";

const databaseMocks = vi.hoisted(() => ({connect: vi.fn()}));

vi.mock("../../../config/database.js", () => ({database: databaseMocks}));

vi.mock("../../../config/logger.js", () => ({
  logger: {error: vi.fn()},
}));

function createClient() {
  return {query: vi.fn(), release: vi.fn()};
}

describe("PostgresWorkspaceRepository", () => {
  beforeEach(() => databaseMocks.connect.mockReset());

  it("creates a workspace and its administrator in one transaction", async () => {
    const client = createClient();
    databaseMocks.connect.mockResolvedValue(client);
    const createdAt = new Date("2026-09-29T10:00:00.000Z");
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({rows: [{
        id: "workspace-id", name: "Engineering", created_by: "creator-id",
        created_at: createdAt,
      }]})
      .mockResolvedValueOnce({rowCount: 1})
      .mockResolvedValueOnce({});

    const result = await new PostgresWorkspaceRepository().createWorkspace({
      id: "workspace-id", name: "Engineering", creatorId: "creator-id", createdAt,
    });

    expect(result).toEqual({
      id: "workspace-id", name: "Engineering", createdBy: "creator-id",
      createdAt: createdAt.toISOString(),
    });
    expect(client.query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(client.query.mock.calls[2]?.[0]).toContain("'administrator'");
    expect(client.query.mock.calls[3]?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back when the initial administrator cannot be inserted", async () => {
    const client = createClient();
    databaseMocks.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({rows: [{
        id: "workspace-id", name: "Engineering", created_by: "creator-id",
        created_at: new Date(),
      }]})
      .mockRejectedValueOnce(new Error("member insert failed"))
      .mockResolvedValueOnce({});

    await expect(new PostgresWorkspaceRepository().createWorkspace({
      id: "workspace-id", name: "Engineering", creatorId: "creator-id",
      createdAt: new Date(),
    })).rejects.toThrow("member insert failed");
    expect(client.query.mock.calls[3]?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects self-add before opening a transaction", async () => {
    const result = await new PostgresWorkspaceRepository().addMember({
      workspaceId: "workspace-id", actorId: "same-user", userId: "same-user",
      role: "administrator", changedAt: new Date(),
    });
    expect(result).toBe("self-change");
    expect(databaseMocks.connect).not.toHaveBeenCalled();
  });

  it("does not allow a non-administrator to add a member", async () => {
    const client = createClient();
    databaseMocks.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({rowCount: 1, rows: [{id: "workspace-id"}]})
      .mockResolvedValueOnce({rows: [{user_id: "actor-id", role: "editor"}]})
      .mockResolvedValueOnce({});

    const result = await new PostgresWorkspaceRepository().addMember({
      workspaceId: "workspace-id", actorId: "actor-id", userId: "target-id",
      role: "viewer", changedAt: new Date(),
    });
    expect(result).toBe("forbidden");
    expect(client.query.mock.calls[3]?.[0]).toBe("COMMIT");
  });

  it.each(["changeMemberRole", "removeMember"] as const)(
    "prevents %s for the last administrator",
    async (operation) => {
      const client = createClient();
      databaseMocks.connect.mockResolvedValue(client);
      client.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({rowCount: 1, rows: [{id: "workspace-id"}]})
        .mockResolvedValueOnce({rows: [{user_id: "actor-id", role: "administrator"}]})
        .mockResolvedValueOnce({rows: [{user_id: "target-id", role: "administrator"}]})
        .mockResolvedValueOnce({rows: [{present: false}]})
        .mockResolvedValueOnce({});

      const repository = new PostgresWorkspaceRepository();
      const result = operation === "changeMemberRole"
        ? await repository.changeMemberRole({
          workspaceId: "workspace-id", actorId: "actor-id", userId: "target-id",
          role: "editor", changedAt: new Date(),
        })
        : await repository.removeMember({
          workspaceId: "workspace-id", actorId: "actor-id", userId: "target-id",
        });
      expect(result).toBe("last-administrator");
      expect(client.query.mock.calls[5]?.[0]).toBe("COMMIT");
    },
  );
});