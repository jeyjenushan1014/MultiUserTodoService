import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANONYMIZED_TODO_OWNER_ID,
  PostgresAccountDeletionRepository,
} from "../account-deletion.repository.js";

const clientMocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../config/database.js", () => ({
  database: {
    connect: vi.fn(() => Promise.resolve(clientMocks)),
  },
}));

describe("PostgresAccountDeletionRepository", () => {
  beforeEach(() => {
    clientMocks.query.mockReset();
    clientMocks.release.mockReset();
  });

  it("removes account-linked data while preserving shared tasks and anonymizing history", async () => {
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ email: "owner@example.com" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "personal-task-id" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await new PostgresAccountDeletionRepository().eraseAccountData("account-id", ["workspace-id"]);

    const queryTexts = clientMocks.query.mock.calls.map((call) => String(call[0]));

    expect(clientMocks.query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(clientMocks.query.mock.calls[1]?.[0]).toContain("INSERT INTO account_deletion_tombstones");
    expect(clientMocks.query.mock.calls[5]?.[0]).toContain("UPDATE todos SET workspace_id = NULL");
    expect(clientMocks.query.mock.calls[5]?.[1]).toEqual([["workspace-id"]]);
    expect(clientMocks.query.mock.calls[6]?.[0]).toContain("todo.workspace_id IS NULL");
    expect(clientMocks.query.mock.calls[6]?.[0]).toContain("share.recipient_id <> $1");
    expect(queryTexts.some((query) => query.includes("[deleted account content]"))).toBe(true);
    expect(clientMocks.query.mock.calls.some(([query, params]) =>
      String(query).includes("UPDATE todos SET owner_id = $2 WHERE owner_id = $1") &&
      JSON.stringify(params) === JSON.stringify(["account-id", ANONYMIZED_TODO_OWNER_ID]))).toBe(true);
    expect(queryTexts.some((query) => query.includes("UPDATE todo_history") && query.includes("details = '{}'::jsonb"))).toBe(true);
    expect(queryTexts.some((query) => query.includes("SET payload = '{}'::jsonb"))).toBe(true);
    expect(clientMocks.query.mock.calls.some(([query]) => query === "DELETE FROM chain_submissions WHERE task_id = ANY($1::uuid[])")).toBe(true);
    expect(clientMocks.query.mock.calls.some(([query]) => query === "DELETE FROM task_chain_events WHERE task_id = ANY($1::uuid[])")).toBe(true);
    expect(clientMocks.query.mock.calls.some(([query]) => query === "DELETE FROM todo_owners WHERE id = $1")).toBe(true);
    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(clientMocks.release).toHaveBeenCalledOnce();
  });

  it("rolls back all changes if a cleanup statement fails", async () => {
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ email: null }] })
      .mockRejectedValueOnce(new Error("projection update failed"))
      .mockResolvedValueOnce({});

    await expect(
      new PostgresAccountDeletionRepository().eraseAccountData("account-id", []),
    ).rejects.toThrow("projection update failed");

    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(clientMocks.release).toHaveBeenCalledOnce();
  });
});