exports.up = (pgm) => {
  pgm.createTable("workflow_reservations", {
    workflow_id: { type: "uuid", primaryKey: true },
    owner_id: { type: "uuid", notNull: true },
    workspace_name: { type: "text", notNull: true },
    correlation_id: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("workflow_reservations");
};