import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { PostgresAccountDeletionRepository } from "../account-deletion.repository.js";

const clientMocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  databaseQuery: vi.fn(),
}));

vi.mock("../../../../config/database.js", () => ({
  database: {
    connect: vi.fn(() => Promise.resolve(clientMocks)),
    query: clientMocks.databaseQuery,
  },
}));

describe("PostgresAccountDeletionRepository", () => {
  beforeEach(() => {
    clientMocks.query.mockReset();
    clientMocks.release.mockReset();
    clientMocks.databaseQuery.mockReset();
  });

  it("persists one request and revokes every active session transactionally", async () => {
    const requestedAt = new Date("2026-10-01T12:00:00.000Z");
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "account-id" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "deletion-request-id", requested_at: requestedAt }] })
      .mockResolvedValueOnce({ rows: [{ id: "session-id" }] })
      .mockResolvedValueOnce({ rows: [{ revoked_at: requestedAt }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await new PostgresAccountDeletionRepository().requestDeletion({
      userId: "account-id",
      idempotencyKey: "delete-account-key-1",
      correlationId: "request-correlation-id",
    });

    expect(result).toEqual({ id: "deletion-request-id", requestedAt });
    expect(clientMocks.query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(clientMocks.query.mock.calls[1]?.[0]).toContain("pg_advisory_xact_lock");
    expect(clientMocks.query.mock.calls[2]?.[0]).toContain("SELECT id FROM users WHERE id = $1 FOR UPDATE");
    expect(clientMocks.query.mock.calls[3]?.[0]).toContain("status IN ('pending', 'running')");
    expect(clientMocks.query.mock.calls[4]?.[0]).toContain("ON CONFLICT (user_id, idempotency_key_hash) DO NOTHING");
    expect(clientMocks.query.mock.calls[5]?.[0]).toContain("SELECT id FROM sessions WHERE user_id = $1");
    expect(clientMocks.query.mock.calls[6]?.[0]).toContain("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP");
    expect(clientMocks.query.mock.calls[7]?.[0]).toContain("SET session_ids = $2::jsonb");
    expect(clientMocks.query.mock.calls[8]?.[0]).toContain("INSERT INTO outbox_events");
    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(clientMocks.release).toHaveBeenCalledOnce();
  });

  it("returns the original request for an idempotent retry without revoking twice", async () => {
    const requestedAt = new Date("2026-10-01T12:00:00.000Z");
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "account-id" }] })
      .mockResolvedValueOnce({ rows: [{ id: "existing-request-id", requested_at: requestedAt }] })
      .mockResolvedValueOnce({});

    const result = await new PostgresAccountDeletionRepository().requestDeletion({
      userId: "account-id",
      idempotencyKey: "delete-account-key-1",
      correlationId: "retry-correlation-id",
    });

    expect(result).toEqual({ id: "existing-request-id", requestedAt });
    expect(clientMocks.query).toHaveBeenCalledTimes(5);
    expect(clientMocks.query.mock.calls[1]?.[0]).toContain("pg_advisory_xact_lock");
    expect(clientMocks.query.mock.calls[3]?.[0]).toContain("SELECT id, requested_at FROM account_deletion_requests");
    expect(clientMocks.query.mock.calls[3]?.[1]).toEqual([
      "account-id",
    ]);
    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(clientMocks.release).toHaveBeenCalledOnce();
  });

  it("promotes a remaining workspace member before removing the last administrator", async () => {
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: "deletion-request-id",
        user_id: "account-id",
        correlation_id: "correlation-id",
        current_step: "prepare-workspaces",
        orphaned_workspace_ids: [],
      }] })
      .mockResolvedValueOnce({ rows: [{
        workspace_id: "workspace-id",
        role: "administrator",
        created_by: "account-id",
      }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "successor-id", role: "editor" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await new PostgresAccountDeletionRepository().prepareWorkspaceDeletion("deletion-request-id");

    expect(result).toEqual({ orphanedWorkspaceIds: [], workspaceIds: ["workspace-id"] });
    expect(clientMocks.query.mock.calls[4]?.[0]).toContain("SET role = 'administrator'");
    expect(clientMocks.query.mock.calls[4]?.[1]).toEqual(["workspace-id", "successor-id"]);
    expect(clientMocks.query.mock.calls[5]?.[0]).toContain("INSERT INTO outbox_events");
    expect(clientMocks.query.mock.calls[7]?.[0]).toContain("DELETE FROM workspace_members");
    expect(clientMocks.query.mock.calls[9]?.[0]).toContain("current_step = 'todo-cleanup'");
    expect(clientMocks.query.mock.calls[9]?.[0]).not.toContain("lease_owner = NULL");
    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("claims work with an expiring lease and competing-worker protection", async () => {
    clientMocks.databaseQuery.mockResolvedValueOnce({ rows: [{
      id: "deletion-request-id",
      user_id: "account-id",
      correlation_id: "correlation-id",
      current_step: "todo-cleanup",
      orphaned_workspace_ids: [],
      workspace_ids: [],
      session_ids: [],
    }] });

    const result = await new PostgresAccountDeletionRepository().claimNext("worker-a", 30_000);

    expect(result?.id).toBe("deletion-request-id");
    expect(clientMocks.databaseQuery.mock.calls[0]?.[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(clientMocks.databaseQuery.mock.calls[0]?.[0]).toContain("lease_expires_at = CURRENT_TIMESTAMP");
    expect(clientMocks.databaseQuery.mock.calls[0]?.[1]).toEqual(["worker-a", 30_000]);
  });

  it("returns failed participant work to the durable retry queue", async () => {
    clientMocks.databaseQuery.mockResolvedValueOnce({});

    await new PostgresAccountDeletionRepository().retry("deletion-request-id");

    expect(clientMocks.databaseQuery.mock.calls[0]?.[0]).toContain("status = 'pending'");
    expect(clientMocks.databaseQuery.mock.calls[0]?.[0]).toContain("next_attempt_at = CURRENT_TIMESTAMP");
    expect(clientMocks.databaseQuery.mock.calls[0]?.[0]).toContain("WHERE id = $1 AND status = 'running'");
  });

  it("does not delete an account while identity events are unpublished", async () => {
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ user_id: "account-id" }] })
      .mockResolvedValueOnce({ rows: [{ email: "user@example.com" }] })
      .mockResolvedValueOnce({ rows: [{ pending: true }] })
      .mockResolvedValueOnce({});

    await expect(
      new PostgresAccountDeletionRepository().complete("deletion-request-id"),
    ).rejects.toThrow("Account events are still pending delivery");

    expect(clientMocks.query.mock.calls[3]?.[0]).toContain("published_at IS NULL");
    expect(clientMocks.query.mock.calls.some(([query]) => query === "DELETE FROM users WHERE id = $1")).toBe(false);
    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });

  it("removes identity-linked deliveries and outbox payloads before final account deletion", async () => {
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ user_id: "account-id" }] })
      .mockResolvedValueOnce({ rows: [{ email: "user@example.com" }] })
      .mockResolvedValueOnce({ rows: [{ pending: false }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await new PostgresAccountDeletionRepository().complete("deletion-request-id");

    expect(clientMocks.query.mock.calls[4]?.[0]).toContain("DELETE FROM notification_event_deliveries");
    expect(clientMocks.query.mock.calls[5]?.[0]).toContain("DELETE FROM outbox_events");
    expect(clientMocks.query.mock.calls[6]?.[0]).toBe("DELETE FROM users WHERE id = $1");
    expect(clientMocks.query.mock.calls.at(-2)?.[0]).toContain("user_id_hash = COALESCE(user_id_hash, $2)");
    expect(clientMocks.query.mock.calls.at(-2)?.[1]).toEqual([
      "deletion-request-id",
      createHash("sha256").update("account-id").digest("hex"),
    ]);
    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });
});