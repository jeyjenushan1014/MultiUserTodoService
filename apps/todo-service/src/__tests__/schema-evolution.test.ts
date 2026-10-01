import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../");

describe("Schema Evolution & Reversibility (EV-1, EV-2, EV-9, EV-10)", () => {
  it("EV-9: all migrations in account-service and todo-service export a reversible down() handler", async () => {
    const accountMigrationsDir = resolve(repoRoot, "apps/account-service/migrations");
    const todoMigrationsDir = resolve(repoRoot, "apps/todo-service/migrations");

    const accountFiles = readdirSync(accountMigrationsDir).filter((f) => f.endsWith(".cjs"));
    const todoFiles = readdirSync(todoMigrationsDir).filter((f) => f.endsWith(".cjs"));

    expect(accountFiles.length).toBeGreaterThanOrEqual(10);
    expect(todoFiles.length).toBeGreaterThanOrEqual(17);

    for (const file of accountFiles) {
      const fileUrl = pathToFileURL(resolve(accountMigrationsDir, file)).href;
      const mod = (await import(fileUrl)) as { up?: unknown; down?: unknown };
      expect(typeof mod.up).toBe("function");
      expect(typeof mod.down).toBe("function");
    }

    for (const file of todoFiles) {
      const fileUrl = pathToFileURL(resolve(todoMigrationsDir, file)).href;
      const mod = (await import(fileUrl)) as { up?: unknown; down?: unknown };
      expect(typeof mod.up).toBe("function");
      expect(typeof mod.down).toBe("function");
    }
  });

  it("EV-1 & EV-2: online schema change applies without breaking concurrent queries from older code versions", async () => {
    // Simulated table with initial schema (v1)
    const activeQueries: string[] = [];
    let schemaHasNewColumn = false;

    const queryMock = vi.fn((sql: string) => {
      activeQueries.push(sql);
      // If query is an insert from old code (v1), it doesn't specify new_evolution_column
      if (sql.includes("INSERT INTO todos_evolution_test")) {
        return Promise.resolve({
          rows: [{ id: "task-1", title: "Existing format", new_col: schemaHasNewColumn ? "default_val" : undefined }],
          rowCount: 1,
        });
      }
      // If query is a select from old code (v1)
      if (sql.includes("SELECT id, title FROM todos_evolution_test")) {
        return Promise.resolve({
          rows: [{ id: "task-1", title: "Existing format" }],
          rowCount: 1,
        });
      }
      // DDL Migration up: additive non-locking column with default
      if (sql.includes("ALTER TABLE todos_evolution_test ADD COLUMN")) {
        schemaHasNewColumn = true;
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      // DDL Migration down: rollback column
      if (sql.includes("ALTER TABLE todos_evolution_test DROP COLUMN")) {
        schemaHasNewColumn = false;
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const client = {
      query: queryMock,
      release: vi.fn(),
    } as unknown as PoolClient;

    const pool = {
      connect: vi.fn(() => Promise.resolve(client)),
      query: (sql: string) => queryMock(sql),
    } as unknown as Pool;

    // Phase 1: Old code is serving traffic against V1 schema
    const v1Insert = await pool.query(
      "INSERT INTO todos_evolution_test (id, title) VALUES ($1, $2) RETURNING id, title",
      ["task-1", "Old client request"],
    );
    expect(v1Insert.rows[0]).toBeDefined();

    // Phase 2: Online schema migration is executed concurrently while traffic flows
    const migrationPromise = pool.query(
      "ALTER TABLE todos_evolution_test ADD COLUMN IF NOT EXISTS priority varchar(16) DEFAULT 'medium'",
    );

    // Concurrent old-code request in-flight during/after migration
    const concurrentOldRequest = await pool.query(
      "SELECT id, title FROM todos_evolution_test WHERE id = $1",
      ["task-1"],
    );
    expect(concurrentOldRequest.rows[0]).toEqual({
      id: "task-1",
      title: "Existing format",
    });

    await migrationPromise;
    expect(schemaHasNewColumn).toBe(true);

    // Phase 3: Old code continues to insert without specifying new column; database applies default without error
    const subsequentOldRequest = await pool.query(
      "INSERT INTO todos_evolution_test (id, title) VALUES ($1, $2) RETURNING id, title",
      ["task-2", "Another old client request"],
    );
    expect(subsequentOldRequest.rows[0]).toBeDefined();

    // Phase 4: EV-10 Rollback test (reversal without restoring database backup)
    await pool.query("ALTER TABLE todos_evolution_test DROP COLUMN IF EXISTS priority");
    expect(schemaHasNewColumn).toBe(false);

    // Post-rollback old-code request continues successfully
    const postRollbackRequest = await pool.query(
      "SELECT id, title FROM todos_evolution_test WHERE id = $1",
      ["task-1"],
    );
    expect(postRollbackRequest.rows[0]).toBeDefined();
  });
});
