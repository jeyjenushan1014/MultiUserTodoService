import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("todos", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    owner_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },

    title: {
      type: "text",
      notNull: true,
    },

    description: {
      type: "text",
      notNull: false,
    },

    state: {
      type: "text",
      notNull: true,
      default: "pending",
    },

    due_date: {
      type: "timestamptz",
      notNull: false,
    },

    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },

    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },

    deleted_at: {
      type: "timestamptz",
      notNull: false,
    },
  });

  pgm.addConstraint(
    "todos",
    "chk_todos_state",
    {
      check: "state IN ('pending', 'in_progress', 'completed')",
    },
  );

  pgm.createIndex(
    "todos",
    ["owner_id", "created_at"],
    {
      name: "idx_todos_owner_created_at",
      where: "deleted_at IS NULL",
    },
  );

  pgm.createIndex(
    "todos",
    ["owner_id", "state"],
    {
      name: "idx_todos_owner_state",
      where: "deleted_at IS NULL",
    },
  );

  pgm.createIndex(
    "todos",
    ["owner_id", "due_date"],
    {
      name: "idx_todos_owner_due_date",
      where: "deleted_at IS NULL",
    },
  );

  pgm.createIndex(
    "todos",
    ["owner_id", "title"],
    {
      name: "uq_todos_owner_title_active",
      unique: true,
      where: "deleted_at IS NULL",
    },
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("todos");
}