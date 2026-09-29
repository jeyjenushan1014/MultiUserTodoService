exports.up = (pgm) => {
  pgm.addColumn("todos", {
    workspace_id: {
      type: "uuid",
      notNull: false,
    },
  });

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_todos_workspace_id_active
    ON todos (workspace_id)
    WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_todos_workspace_id_active;
  `);

  pgm.dropColumn("todos", "workspace_id");
};
