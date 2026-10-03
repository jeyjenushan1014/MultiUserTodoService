import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Pool,
  PoolClient,
} from "pg";

import {
  PostgresListTodosRepository,
} from "../list/postgres-list-todos.repository.js";

function createRows(count: number) {
  return Array.from({ length: Math.min(count, 10) }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    owner_id: "11111111-1111-4111-8111-111111111111",
    owner_email: "operator@example.test",
    title: `Todo ${index + 1}`,
    description: null,
    state: "pending",
    due_date: null,
    created_at: new Date("2026-10-01T00:00:00.000Z"),
    updated_at: new Date("2026-10-01T00:00:00.000Z"),
    access_type: "owner",
    shared_with: [],
  }));
}

async function countDatabaseCalls(totalItems: number): Promise<number> {
  const calls: string[] = [];
  const client = {
    query: async (statement: string) => {
      calls.push(statement);
      if (statement.includes("COUNT(*)")) {
        return { rows: [{ total_items: String(totalItems) }] };
      }
      if (statement.includes("FROM todos t")) {
        return { rows: createRows(totalItems) };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const pool = {
    connect: async () => client,
  } as unknown as Pick<Pool, "connect">;
  const repository = new PostgresListTodosRepository(pool);

  await repository.listTodos({
    ownerId: "11111111-1111-4111-8111-111111111111",
    page: 1,
    pageSize: 10,
    access: "all",
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  return calls.length;
}

describe("PostgresListTodosRepository query count", () => {
  it("keeps database round trips constant as the result set grows", async () => {
    const emptyPageCalls = await countDatabaseCalls(0);
    const populatedPageCalls = await countDatabaseCalls(10_000);

    expect(emptyPageCalls).toBe(4);
    expect(populatedPageCalls).toBe(emptyPageCalls);
  });

  it("uses a composite keyset predicate for cursor pages", async () => {
    let listStatement = "";
    let listValues: readonly unknown[] = [];
    const client = {
      query: async (statement: string, values?: readonly unknown[]) => {
        if (statement.includes("COUNT(*)")) {
          return { rows: [{ total_items: "10000" }] };
        }
        if (statement.includes("FROM todos t")) {
          listStatement = statement;
          listValues = values ?? [];
          return { rows: createRows(10) };
        }
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
    } as unknown as Pick<Pool, "connect">;
    const repository = new PostgresListTodosRepository(pool);
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-10-01T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000001",
        sortOrder: "desc",
      }),
    ).toString("base64url");

    const result = await repository.listTodos({
      ownerId: "11111111-1111-4111-8111-111111111111",
      page: 1,
      pageSize: 2,
      cursor,
      access: "all",
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(listStatement).toContain("AND (t.created_at, t.id) <");
    expect(listStatement).not.toContain("OFFSET");
    expect(listValues).toContain("2026-10-01T00:00:00.000Z");
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();
  });
});